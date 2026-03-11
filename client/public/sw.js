/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-a959eb95'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();

  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "assets/About-Y8xT6cI4.js",
    "revision": null
  }, {
    "url": "assets/AddCard-CWVLf2x-.js",
    "revision": null
  }, {
    "url": "assets/AdminDashboard-DoLc2Qb8.js",
    "revision": null
  }, {
    "url": "assets/alert-CJlu9hdp.js",
    "revision": null
  }, {
    "url": "assets/AnalyticsDashboard-BBjEYLQ6.js",
    "revision": null
  }, {
    "url": "assets/AnalyticsDashboard-BlUQov05.js",
    "revision": null
  }, {
    "url": "assets/api-CYS0xUly.js",
    "revision": null
  }, {
    "url": "assets/APIKeys-D9I-Q7Uq.js",
    "revision": null
  }, {
    "url": "assets/AppMarketplace-CSwKR9Fi.js",
    "revision": null
  }, {
    "url": "assets/badge-D9_ttF5k.js",
    "revision": null
  }, {
    "url": "assets/BillPay-CsZWzCZr.js",
    "revision": null
  }, {
    "url": "assets/BNPLCheckout-CNWrccOV.js",
    "revision": null
  }, {
    "url": "assets/BNPLDashboard-DY6aTpGN.js",
    "revision": null
  }, {
    "url": "assets/button-npwR9PwF.js",
    "revision": null
  }, {
    "url": "assets/card-CPByOuG1.js",
    "revision": null
  }, {
    "url": "assets/CardScanner-BHZv2sSd.js",
    "revision": null
  }, {
    "url": "assets/chart-vendor-DPpgHdka.js",
    "revision": null
  }, {
    "url": "assets/checkbox-Ckz6YJds.js",
    "revision": null
  }, {
    "url": "assets/CrossBorderPayment-Dp8kpWuz.js",
    "revision": null
  }, {
    "url": "assets/CryptoTrading-DZZvdBK2.js",
    "revision": null
  }, {
    "url": "assets/CurrencyConvert-B4Ak-3KV.js",
    "revision": null
  }, {
    "url": "assets/CustomerDetails-997kmY9l.js",
    "revision": null
  }, {
    "url": "assets/Customers-C5C7yI2j.js",
    "revision": null
  }, {
    "url": "assets/Dashboard-CNovEzWi.js",
    "revision": null
  }, {
    "url": "assets/date-vendor-l0sNRNKZ.js",
    "revision": null
  }, {
    "url": "assets/DeveloperPortal-BtM315qL.js",
    "revision": null
  }, {
    "url": "assets/dialog-ZWmAW_2L.js",
    "revision": null
  }, {
    "url": "assets/Disputes-4ZpOjljG.js",
    "revision": null
  }, {
    "url": "assets/Feedback-BtRQcmJJ.js",
    "revision": null
  }, {
    "url": "assets/ForgotPassword-BeBkPrg_.js",
    "revision": null
  }, {
    "url": "assets/format-OW2-8491.js",
    "revision": null
  }, {
    "url": "assets/HelpCenter-UOnCjJFI.js",
    "revision": null
  }, {
    "url": "assets/index-B3rkGZYT.css",
    "revision": null
  }, {
    "url": "assets/index-BXOufFEt.js",
    "revision": null
  }, {
    "url": "assets/index-CfgeIkeQ.js",
    "revision": null
  }, {
    "url": "assets/input-DRwb1A8o.js",
    "revision": null
  }, {
    "url": "assets/Investment-DPNLf6HD.js",
    "revision": null
  }, {
    "url": "assets/label-IIQVctPI.js",
    "revision": null
  }, {
    "url": "assets/LanguageSettings-CsYuPXWT.js",
    "revision": null
  }, {
    "url": "assets/Layout-0UMZGtZf.js",
    "revision": null
  }, {
    "url": "assets/Login-UmkaC2Ui.js",
    "revision": null
  }, {
    "url": "assets/MakePayment-BTPyruO-.js",
    "revision": null
  }, {
    "url": "assets/MerchantCheckout-DptN8oXm.js",
    "revision": null
  }, {
    "url": "assets/MerchantDashboard-DagXhXn5.js",
    "revision": null
  }, {
    "url": "assets/NigerianBankTransfer-EmNfvmOy.js",
    "revision": null
  }, {
    "url": "assets/NotificationsCenter-BY55TBQD.js",
    "revision": null
  }, {
    "url": "assets/offline-vendor-B3QPy4uZ.js",
    "revision": null
  }, {
    "url": "assets/OnboardingChecklist-DNLxh7n-.js",
    "revision": null
  }, {
    "url": "assets/P2PPayments-Cq3kgVJu.js",
    "revision": null
  }, {
    "url": "assets/payment-methods.service-ohcWcPTa.js",
    "revision": null
  }, {
    "url": "assets/PaymentBadgeDemo-fmXfWKAo.js",
    "revision": null
  }, {
    "url": "assets/PaymentMethods-CueK8KR-.js",
    "revision": null
  }, {
    "url": "assets/PaymentSuccess-B5VKSzxo.js",
    "revision": null
  }, {
    "url": "assets/PrivacySettings-CwgYDZat.js",
    "revision": null
  }, {
    "url": "assets/Profile-CTXAfr7g.js",
    "revision": null
  }, {
    "url": "assets/progress-CEF_moay.js",
    "revision": null
  }, {
    "url": "assets/QRPayments-GCn6OFRz.js",
    "revision": null
  }, {
    "url": "assets/query-vendor-CShKR_XR.js",
    "revision": null
  }, {
    "url": "assets/react-vendor-CrU5rgbQ.js",
    "revision": null
  }, {
    "url": "assets/Reconciliation-0wsFrsTT.js",
    "revision": null
  }, {
    "url": "assets/redux-vendor-Dgt4u6Zw.js",
    "revision": null
  }, {
    "url": "assets/RefundsTimeline-CCV8mfLn.js",
    "revision": null
  }, {
    "url": "assets/ResetPassword-CYUzMnCw.js",
    "revision": null
  }, {
    "url": "assets/RevenueAnalytics-C0mBrvvS.js",
    "revision": null
  }, {
    "url": "assets/SavingsGoals-Be5JMB1o.js",
    "revision": null
  }, {
    "url": "assets/SecurityCenter-R0cNO60X.js",
    "revision": null
  }, {
    "url": "assets/SecurityDashboard-DgKL6snb.js",
    "revision": null
  }, {
    "url": "assets/SecuritySettings-8WeIanMR.js",
    "revision": null
  }, {
    "url": "assets/select-BWK6H6z5.js",
    "revision": null
  }, {
    "url": "assets/separator-q8LKYmM5.js",
    "revision": null
  }, {
    "url": "assets/Settings-B1wE33WR.js",
    "revision": null
  }, {
    "url": "assets/Signup-CZ-sJ45q.js",
    "revision": null
  }, {
    "url": "assets/Stablecoins-DS0qL7hW.js",
    "revision": null
  }, {
    "url": "assets/Support-BJtNLqPo.js",
    "revision": null
  }, {
    "url": "assets/tabs-xsnTD3Si.js",
    "revision": null
  }, {
    "url": "assets/Terms-CoJahTgb.js",
    "revision": null
  }, {
    "url": "assets/textarea-BrFHVk2t.js",
    "revision": null
  }, {
    "url": "assets/TransactionDetails-D2EZ2Ypc.js",
    "revision": null
  }, {
    "url": "assets/TransactionExport-BrisXANs.js",
    "revision": null
  }, {
    "url": "assets/TransactionFilter-BZwDsqWW.js",
    "revision": null
  }, {
    "url": "assets/Transactions-BIjqwjs4.js",
    "revision": null
  }, {
    "url": "assets/TransactionSearch-Cqzz2bI9.js",
    "revision": null
  }, {
    "url": "assets/Treasury--8bl-EOx.js",
    "revision": null
  }, {
    "url": "assets/ui-vendor-BrzYbAyv.js",
    "revision": null
  }, {
    "url": "assets/VerifyEmail-Dll2ViHg.js",
    "revision": null
  }, {
    "url": "assets/VerifyPhone-D9Cxioht.js",
    "revision": null
  }, {
    "url": "assets/VirtualCards-CQgrnQ5A.js",
    "revision": null
  }, {
    "url": "assets/Webhooks-C9pOLfbD.js",
    "revision": null
  }, {
    "url": "index.html",
    "revision": "e08956363bda69d844501ff88f582f9d"
  }, {
    "url": "offline.html",
    "revision": "bf7bd91a74aa83c2f7896261711f6dde"
  }, {
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "robots.txt",
    "revision": "496b253cb76aa2f5a546f9ed567fdcbc"
  }, {
    "url": "manifest.webmanifest",
    "revision": "b82bcff6c7d072cd08e8211712b7d840"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/api\.paygate\.com\/.*/i, new workbox.NetworkFirst({
    "cacheName": "api-cache",
    "networkTimeoutSeconds": 10,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: 86400
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/, new workbox.CacheFirst({
    "cacheName": "image-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 50,
      maxAgeSeconds: 2592000
    })]
  }), 'GET');

}));
