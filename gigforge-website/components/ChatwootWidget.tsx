'use client'

import Script from 'next/script'

export default function ChatwootWidget() {
  return (
    <Script
      id="chatwoot-widget"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(d,t) {
            var BASE_URL="http://78.47.104.139:3500";
            var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
            g.src=BASE_URL+"/packs/js/sdk.js";
            g.defer=true;
            g.async=true;
            s.parentNode.insertBefore(g,s);
            g.onload=function(){
              window.chatwootSDK.run({
                websiteToken: '1qpWyaBhHimnopihcnZYdgAb',
                baseUrl: BASE_URL
              })
            }
          })(document,"script");
        `,
      }}
    />
  )
}
