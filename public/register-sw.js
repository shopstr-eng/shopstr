// This script handles service worker registration

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    // First, try to unregister any existing service workers to avoid conflicts
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister().then(function() {
          console.log('Service Worker unregistered successfully');
        }).catch(function(error) {
          console.error('Service Worker unregistration failed:', error);
        });
      }
      
      // After unregistering old service workers, register the new one
      setTimeout(() => {
        navigator.serviceWorker.register('/service-worker.js')
          .then(function(registration) {
            console.log('Service Worker registration successful with scope: ', registration.scope);
          })
          .catch(function(error) {
            console.error('Service Worker registration failed:', error);
          });
      }, 1000); // Small delay to ensure unregistration completes
    });
  });
}