// Progressive enhancement: client-side search + status filtering.
// The page is fully rendered server-side; this only shows/hides cards.
(function () {
  'use strict';

  var search = document.getElementById('search');
  var noResults = document.getElementById('no-results');
  var matters = Array.prototype.slice.call(document.querySelectorAll('.matter'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var activeFilter = 'all';

  function apply() {
    var q = (search && search.value ? search.value : '').trim().toLowerCase();
    var visible = 0;

    matters.forEach(function (el) {
      var matchesFilter = activeFilter === 'all' || el.getAttribute('data-state') === activeFilter;
      var matchesQuery = !q || (el.getAttribute('data-search') || '').indexOf(q) !== -1;
      var show = matchesFilter && matchesQuery;
      el.hidden = !show;
      if (show) visible++;
    });

    if (noResults) noResults.hidden = visible !== 0;
  }

  if (search) search.addEventListener('input', apply);

  filterButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      activeFilter = btn.getAttribute('data-filter') || 'all';
      filterButtons.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      apply();
    });
  });

  apply();
})();
