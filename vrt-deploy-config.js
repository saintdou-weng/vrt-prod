/* Site-wide PROD /exec URL (Paul confirmed 2026-10-23). A URL already saved on a device still wins; a phone or a new browser
   with nothing saved uses this one, so it does not start as "⚪ 未連線". Not applied on localhost / 127.0.0.1 (test runs never
   reach the real backend). No token or key in this file. */
(function(g){var h='';try{h=String(g.location&&g.location.hostname||'')}catch(_){}
  var local=!h||/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(h)||/\.(localhost|test)$/i.test(h);
  g.VRT_DEPLOY_CONFIG=g.VRT_DEPLOY_CONFIG||{gasUrl:local?'':'https://script.google.com/macros/s/AKfycbxKAEMe1Y2bYH2qQkCQclJQljA8-nxgmE-lbbpqbmByzconjC5IjcJJwS8INVytEtvv/exec'};
})(window);
