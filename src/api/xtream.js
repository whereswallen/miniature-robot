const axios = require('axios');

function createXtreamClient({ url, username, password }) {
  const panelUrl = url.replace(/\/+$/, '');

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

  return {
    async getUserInfo(userUsername) {
      return apiCall('user', 'info', { user_username: userUsername });
    },

    async createUser({ userUsername, userPassword, maxConnections = 1, expDate, bouquet }) {
      const params = {
        user_username: userUsername,
        user_password: userPassword,
        max_connections: maxConnections,
      };
      if (expDate) params.exp_date = expDate;
      if (bouquet) params.bouquet = bouquet;
      return apiCall('user', 'create', params);
    },

    async disableUser(userUsername) {
      return apiCall('user', 'disable', { user_username: userUsername });
    },

    async enableUser(userUsername) {
      return apiCall('user', 'enable', { user_username: userUsername });
    },

    async extendUser(userUsername, expDate) {
      return apiCall('user', 'extend', {
        user_username: userUsername,
        exp_date: expDate,
      });
    },

    async healthCheck() {
      try {
        await axios.get(`${panelUrl}/api.php`, {
          params: { username, password, action: 'user', sub: 'info' },
          timeout: 10000,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };
}

module.exports = { createXtreamClient };
