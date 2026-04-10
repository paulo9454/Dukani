window.addEventListener('load', function () {
  if (typeof window.SwaggerUIBundle !== 'function') return;
  window.ui = window.SwaggerUIBundle({
    url: '/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [window.SwaggerUIBundle.presets.apis],
    layout: 'BaseLayout'
  });
});
