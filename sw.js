const CACHE_NAME = 'out-of-loop-gold-v1'; // قمنا بتغيير الإصدار لتحديث الكاش
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',         // تم تصحيح المسار (كان main.css)
  './js/tailwind.min.js',    // تم تصحيح المسار (كان في الجذر)
  './js/game.js',            // إضافة ضرورية
  './js/data.js',            // إضافة ضرورية
  './manifest.json',
  './icon-192.png',       // ⚠️ فعل هذا السطر فقط إذا كانت الصورة موجودة فعلاً في المجلد
  './icon-512.png'        // ⚠️ فعل هذا السطر فقط إذا كانت الصورة موجودة فعلاً في المجلد
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