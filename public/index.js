let page = 1;
let hasMore = true;
let lastLoadTime = 0;
let lastRoot;
let imageWrapper;

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
          const section = document.createElement('div');

          imageWrapper = document.createElement('div');
          imageWrapper.classList.add('wrapper');

          const header = document.createElement('h3');
          header.innerText = root;

          section.appendChild(header);
          section.appendChild(imageWrapper);

          imageList.appendChild(section);

          lastRoot = root;
        }

        if (t.video) createVideo(t);
        else createImage(t);
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
      if (fsLightboxInstances[lightboxName])
        fsLightboxInstances[lightboxName].props.onOpen = () => {
          console.log('open');
        };

      button.disabled = false;
      if (data.pages <= page + 1 || data.images.length === 0) {
        hasMore = false;
        button.style.display = 'none';
      }

      if (data.images.length === 0) {
        const noImages = document.createElement('div');
        noImages.innerText = 'No Images';

        imageList.appendChild(noImages);
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
}

function createImage(f) {
  const container = document.createElement('div');

  const a = document.createElement('a');
  a.setAttribute('href', `/images/${f.preview}`);
  a.setAttribute('data-fslightbox', lightboxName);
  a.setAttribute('data-type', 'image');

  const img = document.createElement('img');
  img.src = `/images/${f.thumbnail}`;

  container.appendChild(a);
  a.appendChild(img);
  imageWrapper.appendChild(container);
}

function createVideo(f) {
  const container = document.createElement('div');

  const a = document.createElement('a');
  a.setAttribute('href', f.video);
  a.setAttribute('data-fslightbox', lightboxName);
  a.setAttribute('data-type', 'video');
  a.setAttribute('data-autoplay', true);

  const videoThumb = document.createElement('img');
  videoThumb.src = `/images/${f.preview}`;

  const icon = document.createElement('img');
  icon.className = 'icon';
  icon.src = '/play.svg';

  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'wrapper';
  iconWrapper.appendChild(icon);

  a.appendChild(videoThumb);
  a.appendChild(iconWrapper);

  container.appendChild(a);
  imageWrapper.appendChild(container);
}

function updateProgress() {
  fetch(`${server}/progress`)
    .then((res) => res.json())
    .then((data) => {
      const progressEl = document.querySelector('.progress');
      const textEl = progressEl.querySelector('.text');

      if (data.processing) {
        progressEl.style.display = undefined;
        textEl.innerText = data.progress;

        setTimeout(updateProgress, 5000);
      } else {
        progressEl.style.display = 'none';
        textEl.innerText = '';
      }
    });
}

window.addEventListener('load', function () {
  loadPage(page);
  updateProgress();
});

window.addEventListener('scroll', function () {
  const scrollBottom = window.scrollY + window.innerHeight >= document.body.offsetHeight - 500;
  if (scrollBottom && Date.now() - lastLoadTime > 1000) {
    lastLoadTime = Date.now();
    loadMore();
  }
});
