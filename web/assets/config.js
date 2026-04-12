(function initConfig() {
  const isLocal = ["127.0.0.1", "localhost"].includes(window.location.hostname);
  const defaults = {
    refreshIntervalMs: 15000,
    odptConsumerKey: "qkpjriztbhvaxwjzum1oluug1hnfvwfq3ztxnsb56xtbt6qve7zdwv8bb73ajavy",
    apiProxyTemplate: isLocal
      ? "/proxy?url={url}"
      : "https://keikyu-proxy.takuma3017.workers.dev/?url={url}",
  };

  const merged = Object.assign({}, defaults, window.APP_CONFIG || {});
  if (!merged.apiProxyTemplate && merged.keikyuProxyTemplate) {
    merged.apiProxyTemplate = merged.keikyuProxyTemplate;
  }
  if (!merged.keikyuProxyTemplate && merged.apiProxyTemplate) {
    merged.keikyuProxyTemplate = merged.apiProxyTemplate;
  }
  window.APP_CONFIG = merged;
})();
