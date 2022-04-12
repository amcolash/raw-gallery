let page = 1;
let hasMore = true;
let lastLoadTime = 0;
let lastRoot;

const server = window.location.origin;

const imageList = document.querySelector('.imageList');
const lightboxName = 'gallery';

function loadPage(page) {
  console.log(`loadPage(${page})`);

  const filterEl = document.querySelector('#filters');
  const filter = filterEl.value;

  const button = document.querySelector('.buttonContainer');
  button.disabled = true;

  fetch(`${server}/imagelist?page=${page}${filter !== 'undefined' ? `&filter=${filter}` : ''}`)
    .then((res) => res.json())
    .then((data) => {
      data.images.forEach((t) => {
        const relative = t.preview.replace('previews/', '');
        const root = relative.substring(0, relative.indexOf('/')) || '/';

        if (lastRoot !== root) {
          const header = document.createElement('h3');
          header.innerText = root;
          imageList.appendChild(header);

          lastRoot = root;
        }

        createImage(t);
      });

      if (filterEl.childNodes.length === 0) {
        const option = document.createElement('option');
        option.text = 'All';
        option.value = undefined;
        filterEl.appendChild(option);

        data.rootDirs.forEach((f) => {
          const option = document.createElement('option');
          option.text = f;
          option.value = f;
          filterEl.appendChild(option);
        });
      }

      refreshFsLightbox();
      fsLightboxInstances[lightboxName].props.onOpen = () => {
        console.log('open');
      };

      button.disabled = false;
      if (data.pages <= page + 1) {
        hasMore = false;
        button.style.display = 'none';
      }
    });
}

function updateFilter(e) {
  page = 0;
  hasMore = true;
  lastRoot = undefined;
  imageList.replaceChildren();

  loadMore();
}

function loadMore() {
  if (hasMore) {
    page++;
    loadPage(page);
  }

  if (page === 1) loadMore();
}

function createImage(f) {
  const img = document.createElement('img');
  img.src = `/images/${f.thumbnail}`;

  const a = document.createElement('a');
  a.setAttribute('href', `/images/${f.preview}`);
  a.setAttribute('data-fslightbox', lightboxName);
  a.setAttribute('data-type', 'image');

  a.appendChild(img);
  imageList.appendChild(a);
}

window.addEventListener('load', function () {
  loadPage(page);
});

window.addEventListener('scroll', function () {
  const scrollBottom = window.scrollY + window.innerHeight >= document.body.offsetHeight - 500;
  if (scrollBottom && Date.now() - lastLoadTime > 1000) {
    lastLoadTime = Date.now();
    loadMore();
  }
});
