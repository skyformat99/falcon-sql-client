import {contains, map} from 'ramda';
import {getSetting} from '../settings.js';
import {getAccessTokenCookieOptions} from '../constants.js';
import {generateAndSaveAccessToken, homeUrl} from '../utils/authUtils';
import Logger from '../logger';
import fetch from 'node-fetch';

const ESCAPED_ROUTES = [
  new RegExp(`^${homeUrl()}/$`),
  new RegExp(`^${homeUrl()}/login$`),
  new RegExp(`^${homeUrl()}/static/`),
  new RegExp(`^${homeUrl()}/oauth2$`),
  new RegExp(`^${homeUrl()}/oauth2/callback$`)
];

function accessTokenIsValid(access_token) {
    const currentTime = Date.now();
    return (getSetting('ACCESS_TOKEN') === access_token &&
            getSetting('ACCESS_TOKEN_EXPIRY') > currentTime);
}

export function PlotlyOAuth(electron) {

    function isAuthorized(req, res, next) {
        const href = req.href();
        const path = req.path();
        Logger.log('debug:');
        Logger.log('path:');
        Logger.log(path);
        Logger.log('href:');
        Logger.log(href);
        Logger.log(ESCAPED_ROUTES);
        if (!getSetting('AUTH_ENABLED')) {
          return (next());
        }
        // Auth is disabled for certain urls:
        if (ESCAPED_ROUTES.some(path.match.bind(path))) {
          return (next());
        }

        // No Auth for electron apps:
        if (electron) {
          return (next());
        }
        if (!accessTokenIsValid(req.cookies['db-connector-auth-token'])) {

            if (!req.cookies['plotly-auth-token']) {
              res.json(401, {error: {message: 'Please login to access this page.'}});
              return;
            }

            const plotlyAuthToken = req.cookies['plotly-auth-token'];

            fetch(`${getSetting('PLOTLY_API_URL')}/v2/users/current`, {
                headers: {'Authorization': `Bearer ${plotlyAuthToken}`}
            })
            .then(userRes => userRes.json().then(userMeta => {
              if (userRes.status !== 200) {
                res.json(401, {error: {message: 'Please login to access this page.'}});
                return;
              }

              if (!contains(userMeta.username, getSetting('ALLOWED_USERS'))) {

                  // Remove any existing credentials and return error
                  res.clearCookie('db-connector-auth-token');
                  res.clearCookie('plotly-auth-token');
                  res.clearCookie('db-connector-user');
                  res.json(403, {error: {message: `User ${userMeta.username} is not allowed to view this app`}});
                  return;
              }

              const dbConnectorAccessToken = generateAndSaveAccessToken();
              res.setCookie('db-connector-auth-token',
                            dbConnectorAccessToken, getAccessTokenCookieOptions());
              return (next());
            }))
            .catch(err => {
                Logger.log(err, 0);
                res.json(500, {error: {message: err.message}});
                return;
            });

        } else {
          return (next());
        }
    }

    return (isAuthorized);
}
