(function initConfig() {
  const isLocal = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  const defaults = {
    refreshIntervalMs: 15000,
    odptConsumerKey: "qkpjriztbhvaxwjzum1oluug1hnfvwfq3ztxnsb56xtbt6qve7zdwv8bb73ajavy",
    keikyuProxyTemplate: "https://keikyu-proxy.takuma3017.workers.dev/?url={url}",
  };

  window.APP_CONFIG = Object.assign({}, defaults, window.APP_CONFIG || {});
})();
