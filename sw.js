const CACHE_NAME = 'out-of-loop-gold-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './main.css',
  './tailwind.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 1. تثبيت الخدمة وتخزين الملفات
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. تفعيل الخدمة وتنظيف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 3. جلب الملفات (أولاً من الكاش، ثم من الشبكة)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // إذا وجد الملف في الكاش، قم بإرجاعه
      if (response) {
        return response;
      }
      // وإلا، اطلبه من الإنترنت
      return fetch(event.request);
    })
  );
});