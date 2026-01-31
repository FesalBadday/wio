const cacheName = 'bara-salfa-v1';
const assets = [
  './',
  './index.html',
  './main.css',
  './tailwind.min.js',
  './icon.png'
];

// تثبيت التطبيق وتخزين الملفات
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(cacheName).then(cache => {
      cache.addAll(assets);
    })
  );
});

// تشغيل اللعبة من التخزين المؤقت عند انقطاع النت
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => {
      return res || fetch(e.request);
    })
  );
});