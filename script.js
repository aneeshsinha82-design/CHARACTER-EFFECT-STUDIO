const $ = id => document.getElementById(id);
const canvas = $('c');
const ctx = canvas.getContext('2d');

let chars = [];
let playing = false;
let raf = 0;
let startTime = 0;
let duration = 20;
let backgroundImage = null;
let backgroundMode = 'builtin';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function fitCanvas() {
  const [a, b] = $('aspect').value.split(':').map(Number);
  canvas.width = 960;
  canvas.height = Math.round(canvas.width * b / a);
  draw(0);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(file);
  });
}

function alphaBox(img) {
  const max = 900;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.drawImage(img, 0, 0, w, h);
  const data = tc.getImageData(0, 0, w, h).data;
  let left = w, top = h, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < 0) return {x:0, y:0, w:img.naturalWidth, h:img.naturalHeight};
  return {
    x: left / scale, y: top / scale,
    w: (right - left + 1) / scale,
    h: (bottom - top + 1) / scale
  };
}

function addCharacter(file) {
  loadImage(file).then(img => {
    chars.push({
      img,
      name: 'Character ' + (chars.length + 1),
      height: 180,
      box: alphaBox(img)
    });
    renderLists();
    draw(0);
    $('msg').textContent = chars.length + ' character' + (chars.length === 1 ? '' : 's') + ' added.';
  });
}

$('add').onclick = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => input.files[0] && addCharacter(input.files[0]);
  input.click();
};

function renderLists() {
  const list = $('list');
  const timeline = $('timeline');
  list.innerHTML = '';
  timeline.innerHTML = '';

  chars.forEach((ch, i) => {
    const row = document.createElement('div');
    row.className = 'char';
    row.innerHTML =
      '<img src="' + ch.img.src + '">' +
      '<div>' +
        '<input data-i="' + i + '" data-k="name" value="' + esc(ch.name) + '">' +
        '<input class="height" data-i="' + i + '" data-k="height" type="number" min="1" step="1" value="' + ch.height + '" placeholder="Height (cm)">' +
        '<label class="upload">Replace image<input data-i="' + i + '" data-k="file" type="file" accept="image/*" hidden></label>' +
      '</div>' +
      '<button data-del="' + i + '" aria-label="Remove">×</button>';
    list.appendChild(row);

    const card = document.createElement('div');
    card.className = 'card';
    card.draggable = true;
    card.dataset.i = i;
    card.innerHTML =
      '<img src="' + ch.img.src + '">' +
      '<strong>' + esc(ch.name) + '</strong>' +
      '<small>' + ch.height + ' cm</small>';
    timeline.appendChild(card);
  });

  // IMPORTANT: do not rebuild the character list while the user is typing.
  // Rebuilding the DOM on every keystroke makes the input lose focus/caret.
  list.querySelectorAll('[data-k=name]').forEach(el => {
    el.oninput = () => {
      const i = +el.dataset.i;
      chars[i].name = el.value;
      const card = timeline.querySelector('.card[data-i="' + i + '"]');
      if (card) {
        const title = card.querySelector('strong');
        if (title) title.textContent = el.value || 'Unnamed Character';
      }
      draw(0);
    };
  });

  list.querySelectorAll('[data-k=height]').forEach(el => {
    el.oninput = () => {
      const i = +el.dataset.i;
      const value = Number(el.value);
      chars[i].height = Math.max(1, Number.isFinite(value) ? value : 1);
      const card = timeline.querySelector('.card[data-i="' + i + '"]');
      if (card) {
        const height = card.querySelector('small');
        if (height) height.textContent = chars[i].height + ' cm';
      }
      draw(0);
    };
  });

  list.querySelectorAll('[data-k=file]').forEach(el => {
    el.onchange = () => {
      if (!el.files[0]) return;
      loadImage(el.files[0]).then(img => {
        chars[+el.dataset.i].img = img;
        chars[+el.dataset.i].box = alphaBox(img);
        renderLists();
        draw(0);
      });
    };
  });

  list.querySelectorAll('[data-del]').forEach(el => {
    el.onclick = () => {
      chars.splice(+el.dataset.del, 1);
      renderLists();
      draw(0);
    };
  });

  let dragIndex = null;
  timeline.querySelectorAll('.card').forEach(card => {
    card.ondragstart = () => {
      dragIndex = +card.dataset.i;
      card.classList.add('drag');
    };
    card.ondragend = () => card.classList.remove('drag');
    card.ondragover = e => e.preventDefault();
    card.ondrop = e => {
      e.preventDefault();
      const to = +card.dataset.i;
      if (dragIndex === null || dragIndex === to) return;
      const moved = chars.splice(dragIndex, 1)[0];
      chars.splice(to, 0, moved);
      dragIndex = null;
      renderLists();
      draw(0);
    };
  });
}

function maxHeight() {
  return chars.reduce((m, ch) => Math.max(m, ch.height), 1);
}

function characterX(index) {
  if (chars.length <= 1) return 0;
  return -4.2 + index * 8.4 / (chars.length - 1);
}

/*
  Camera model:
  - Every character stands on the exact same ground plane.
  - The camera travels from one character to the next.
  - During each segment it moves 68% of the time, then holds on the
    character for the remaining 32%.
  - Camera zoom is calculated from the focused character's real height,
    so a tall character automatically causes the camera to pull back
    while a short character causes it to move closer.
*/
function cameraAt(t) {
  if (!chars.length) return {x:0, zoom:1, focus:-1, progress:0};
  if ($('mode').value === 'all') return {x:0, zoom:1, focus:-1, progress:0};

  const n = chars.length;
  if (n === 1) {
    return {x: characterX(0), zoom: fitZoom(chars[0]), focus:0, progress:1};
  }

  const p = clamp(t / duration, 0, 0.999999);
  const segment = p * (n - 1);
  const i = Math.floor(segment);
  const local = segment - i;
  const moveEnd = 0.68;
  const moveP = clamp(local / moveEnd, 0, 1);
  const focus = moveP < 1 ? i : Math.min(i + 1, n - 1);
  const x0 = characterX(i);
  const x1 = characterX(Math.min(i + 1, n - 1));
  const x = moveP < 1 ? lerp(x0, x1, easeInOut(moveP)) : x1;

  const h0 = chars[i].height;
  const h1 = chars[Math.min(i + 1, n - 1)].height;
  const targetHeight = moveP < 1 ? lerp(h0, h1, easeInOut(moveP)) : h1;

  return {
    x,
    zoom: fitZoom({height: targetHeight}),
    focus,
    progress: p
  };
}

function fitZoom(ch) {
  const largest = maxHeight();
  const h = ch.height || 1;
  // The focused character fills roughly 74% of the viewport height.
  // Taller characters therefore pull the camera back; shorter characters
  // make the camera come closer while preserving proportional sizing.
  return clamp(largest / h, 0.38, 2.15);
}

function worldToScreen(worldX, camera) {
  return canvas.width / 2 + (worldX - camera.x) * canvas.width * 0.075 * camera.zoom;
}

function drawBackground(W, H, ground) {
  ctx.save();

  if (backgroundImage) {
    const iw = backgroundImage.naturalWidth;
    const ih = backgroundImage.naturalHeight;
    const fit = $('bgFit').value;
    let dw = W, dh = H, dx = 0, dy = 0;

    if (fit === 'cover') {
      const s = Math.max(W / iw, H / ih);
      dw = iw * s; dh = ih * s;
      dx = (W - dw) / 2; dy = (H - dh) / 2;
    } else if (fit === 'contain') {
      const s = Math.min(W / iw, H / ih);
      dw = iw * s; dh = ih * s;
      dx = (W - dw) / 2; dy = (H - dh) / 2;
    }

    ctx.filter =
      'blur(' + Number($('bgBlur').value) * 0.35 + 'px) ' +
      'brightness(' + Number($('bgBright').value) + '%)';
    ctx.drawImage(backgroundImage, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#15304b');
    g.addColorStop(0.55, '#7193b1');
    g.addColorStop(1, '#b9c5d0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(0, ground, W, H - ground);

  ctx.strokeStyle = 'rgba(30,45,60,.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(W, ground);
  ctx.stroke();

  if ($('grid').checked) {
    ctx.strokeStyle = 'rgba(35,55,75,.20)';
    ctx.lineWidth = 1;
    for (let cm = 0; cm <= 250; cm += 25) {
      const y = ground - (cm / Math.max(250, maxHeight())) * (H * 0.70);
      if (y < 0) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,35,50,.7)';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(cm + ' cm', 8, y - 3);
    }
  }
  ctx.restore();
}

function draw(t) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const ground = H * 0.82;
  drawBackground(W, H, ground);

  if (!chars.length) {
    ctx.fillStyle = '#667487';
    ctx.font = '600 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Add character images to begin the comparison', W / 2, H / 2);
    $('clock').textContent = '00:00 / 00:' + String(duration).padStart(2, '0');
    return;
  }

  const camera = cameraAt(t);
  const largest = maxHeight();
  const baseVisualScale = (H * 0.70) / largest;
  const focused = camera.focus;

  chars.forEach((ch, i) => {
    const box = ch.box || {x:0, y:0, w:ch.img.naturalWidth, h:ch.img.naturalHeight};
    const naturalVisualH = Math.max(1, box.h);
    const visualScale = baseVisualScale * (ch.height / naturalVisualH) * camera.zoom;

    const visualW = box.w * visualScale;
    const visualH = naturalVisualH * visualScale;
    const centerX = worldToScreen(characterX(i), camera);
    const left = centerX - visualW / 2;
    let top = ground - visualH;

    // Character entrance: when the camera arrives at a character,
    // the character smoothly emerges from the ground upward.
    let entrance = 1;
    if ($('mode').value !== 'all' && focused >= 0) {
      const n = chars.length;
      const segment = n > 1 ? clamp((t / duration) * (n - 1), 0, n - 1) : 0;
      const target = i;
      const arrivalWindow = 0.22;
      const distanceInSegments = segment - target;
      if (distanceInSegments >= -arrivalWindow && distanceInSegments < 0.35) {
        const p = clamp((distanceInSegments + arrivalWindow) / (arrivalWindow + 0.22), 0, 1);
        entrance = easeInOut(p);
      } else if (i < focused) {
        entrance = 1;
      } else if (i > focused) {
        entrance = 0;
      }
    }

    // Keep the feet planted on the exact ground line while the body rises.
    top = ground - visualH * entrance;

    let alpha = 1;
    if ($('mode').value !== 'all' && focused >= 0 && i !== focused) {
      const distance = Math.abs(i - focused);
      alpha = clamp(0.72 - distance * 0.16, 0.18, 0.72);
      if (entrance < 1) alpha = Math.max(alpha, entrance);
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    if (entrance < 1) {
      ctx.beginPath();
      ctx.rect(0, 0, W, ground);
      ctx.clip();
    }

    // Soft contact shadow.
    ctx.fillStyle = 'rgba(30,38,48,.16)';
    ctx.beginPath();
    ctx.ellipse(centerX, ground + 3, Math.max(8, visualW * .28), 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(
      ch.img,
      box.x, box.y, box.w, box.h,
      left, top, visualW, visualH
    );

    if ($('labels').checked) {
      ctx.textAlign = 'center';
      ctx.font = '700 ' + Math.max(11, W * .014) + 'px system-ui';
      ctx.fillStyle = '#182333';
      ctx.fillText(ch.name, centerX, ground + 22);
      ctx.font = '500 ' + Math.max(10, W * .011) + 'px system-ui';
      ctx.fillStyle = '#536176';
      ctx.fillText(ch.height + ' cm', centerX, ground + 39);
    }

    ctx.restore();
  });

  // Camera/focus indicator.
  if ($('mode').value !== 'all' && focused >= 0) {
    const fx = worldToScreen(characterX(focused), camera);
    ctx.strokeStyle = 'rgba(39,123,231,.32)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(fx, 0);
    ctx.lineTo(fx, ground);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const seconds = Math.min(duration, Math.max(0, t));
  $('clock').textContent =
    '00:' + String(Math.floor(seconds)).padStart(2, '0') +
    ' / 00:' + String(duration).padStart(2, '0');
}

function refreshDuration() {
  duration = Number($('duration').value);
  $('durText').textContent = duration + 's';
  draw(0);
}

$('duration').oninput = refreshDuration;
$('aspect').onchange = fitCanvas;
$('mode').onchange = () => draw(0);

$('play').onclick = () => {
  if (playing || !chars.length) return;
  playing = true;
  startTime = performance.now();
  raf = requestAnimationFrame(loop);
};

$('pause').onclick = () => {
  playing = false;
  cancelAnimationFrame(raf);
};

$('reset').onclick = () => {
  playing = false;
  cancelAnimationFrame(raf);
  draw(0);
};

function loop(now) {
  if (!playing) return;
  const elapsed = (now - startTime) / 1000;
  if (elapsed >= duration) {
    draw(duration);
    playing = false;
    return;
  }
  draw(elapsed);
  raf = requestAnimationFrame(loop);
}

$('render').onclick = () => {
  if (!chars.length) {
    $('msg').textContent = 'Add characters first.';
    return;
  }

  const fps = 30;
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(canvas.captureStream(fps), {
    mimeType: mime,
    videoBitsPerSecond: $('resolution').value === '4K' ? 30000000 : 16000000
  });

  const chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, {type:'video/webm'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'character-size-comparison.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('msg').textContent = 'Comparison video rendered — WebM download started.';
  };

  recorder.start();
  $('msg').textContent = 'Rendering the full camera journey…';

  const renderStart = performance.now();
  function renderFrame(now) {
    const elapsed = (now - renderStart) / 1000;
    if (elapsed >= duration) {
      draw(duration);
      recorder.stop();
      return;
    }
    draw(elapsed);
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
};

/* Background controls */
$('bgFile').addEventListener('change', () => {
  const file = $('bgFile').files && $('bgFile').files[0];
  if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
    $('bgStatus').textContent = 'Please choose a PNG, JPG or WebP image.';
    $('bgFile').value = '';
    return;
  }
  $('bgStatus').textContent = 'Loading ' + file.name + '…';
  loadImage(file).then(img => {
    backgroundImage = img;
    $('bgStatus').textContent = '✓ ' + file.name;
    $('builtInBg').classList.remove('active');
    $('uploadBg').classList.add('active');
    draw(0);
  }).catch(() => {
    $('bgStatus').textContent = 'Could not load that image.';
  });
});

$('builtInBg').addEventListener('click', () => {
  backgroundImage = null;
  $('bgFile').value = '';
  $('builtInBg').classList.add('active');
  $('uploadBg').classList.remove('active');
  $('bgStatus').textContent = 'Built-in studio background';
  draw(0);
});
$('bgReset').addEventListener('click', () => {
  backgroundImage = null;
  $('bgFile').value = '';
  $('builtInBg').classList.add('active');
  $('uploadBg').classList.remove('active');
  $('bgStatus').textContent = 'Built-in studio background';
  $('bgBlur').value = 0;
  $('bgBright').value = 100;
  $('blurText').textContent = '0%';
  $('brightText').textContent = '100%';
  draw(0);
});
$('bgFit').addEventListener('change', () => draw(0));
$('bgBlur').addEventListener('input', () => {
  $('blurText').textContent = $('bgBlur').value + '%';
  draw(0);
});
$('bgBright').addEventListener('input', () => {
  $('brightText').textContent = $('bgBright').value + '%';
  draw(0);
});
$('renderTop').addEventListener('click', () => $('render').click());

fitCanvas();
refreshDuration();
renderLists();
