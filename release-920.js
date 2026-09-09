/* Bootstrap update also runs when an older worker serves old JS once. */
if('serviceWorker' in navigator && location.protocol!=='file:' && !window.ASH_QA){let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;location.reload()}});navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});}
