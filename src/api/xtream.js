const axios = require('axios');
const config = require('../config');

const { panelUrl, username, password } = config.xtream;

async function apiCall(action, sub, extraParams = {}) {
  const params = {
    username,
    password,
    action,
    sub,
    ...extraParams,
  };

  const response = await axios.get(`${panelUrl}/api.php`, {
    params,
    timeout: 15000,
  });

  return response.data;
}

async function getUserInfo(userUsername) {
  return apiCall('user', 'info', { user_username: userUsername });
}

async function createUser({ userUsername, userPassword, maxConnections = 1, expDate, bouquet }) {
  const params = {
    user_username: userUsername,
    user_password: userPassword,
    max_connections: maxConnections,
  };

  if (expDate) params.exp_date = expDate;
  if (bouquet) params.bouquet = bouquet;

  return apiCall('user', 'create', params);
}

async function disableUser(userUsername) {
  return apiCall('user', 'disable', { user_username: userUsername });
}

async function enableUser(userUsername) {
  return apiCall('user', 'enable', { user_username: userUsername });
}

async function extendUser(userUsername, expDate) {
  return apiCall('user', 'extend', {
    user_username: userUsername,
    exp_date: expDate,
  });
}

module.exports = {
  getUserInfo,
  createUser,
  disableUser,
  enableUser,
  extendUser,
};
