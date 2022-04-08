let page = 1;
let lastRoot;

const server = window.location.origin;

const imageList = document.querySelector('.imageList');
const lightboxName = 'gallery';

function loadPage(page) {
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
        button.style.display = 'none';
      }
    });
}

function loadMore() {
  page++;
  loadPage(page);
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
