// World Environment Day photo viewer. External file because the site CSP blocks inline scripts.
(function(){var o=document.querySelector('.wed-open'),d=document.querySelector('dialog.wed-viewer');if(!o||!d||!d.showModal)return;
o.addEventListener('click',function(){d.showModal();document.body.classList.add('wed-lock');});
d.addEventListener('click',function(e){if(e.target!==d.querySelector('img'))d.close();});
d.addEventListener('close',function(){document.body.classList.remove('wed-lock');o.focus();});})();
