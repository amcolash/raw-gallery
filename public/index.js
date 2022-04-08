let page = 1;
let hasMore = true;
let lastLoadTime = 0;
let lastRoot;

const server = window.location.origin;

const imageList = document.querySelector('.imageList');
const lightboxName = 'gallery';

function loadPage(page) {
  console.log(`loadPage(${page})`);

  fetch(`${server}/images?page=${page}`)
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

      refreshFsLightbox();
      fsLightboxInstances[lightboxName].props.onOpen = () => {
        console.log('open');
      };

      const button = document.querySelector('.load');
      if (data.pages <= page + 1) {
        hasMore = false;
        button.style.display = 'none';
      }
    });
}

function loadMore() {
  if (hasMore) {
    page++;
    loadPage(page);
  }
}

function createImage(f) {
  const img = document.createElement('img');
  img.src = `/images/${f.thumbnail}`;

  const a = document.createElement('a');
  a.setAttribute('href', `/images/${f.preview}`);
  a.setAttribute('data-fslightbox', lightboxName);

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
