import "./style.css";
import * as THREE from "three";
import {
  SparkRenderer,
  SplatMesh,
  SplatFileType,
} from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="page">
    <div id="viewer" class="viewer">
      <div class="drop-help">
        <div class="eyebrow">拖拽 PLY 文件到这里</div>
        <div class="fine-print">Spark + THREE 3DGS</div>
      </div>
    </div>
    <div class="side">
      <div class="header">
        <div>
          <div class="title">3DGS PLY 上传</div>
          <div class="subtitle">本地拖拽 / 选择文件 即刻查看</div>
        </div>
        <button id="pick-btn" class="primary">选择文件</button>
        <input id="file-input" type="file" accept=".ply" hidden />
      </div>
      <div class="hint">导入后会在右侧打印调试信息，同时在左侧实时渲染。</div>
      <div class="debug">
        <div class="row"><span>状态</span><span id="status">等待文件...</span></div>
        <div class="row"><span>文件</span><span id="file-name">-</span></div>
        <div class="row"><span>大小</span><span id="file-size">-</span></div>
        <div class="row"><span>Splats</span><span id="splat-count">-</span></div>
        <div class="row"><span>耗时</span><span id="load-time">-</span></div>
        <div class="row"><span>包围盒</span><span id="bounds">-</span></div>
      </div>
      <div class="log" id="log"></div>
    </div>
  </div>
`;

// UI references
const viewerEl = document.getElementById("viewer");
const pickBtn = document.getElementById("pick-btn");
const fileInput = document.getElementById("file-input");
const statusEl = document.getElementById("status");
const fileNameEl = document.getElementById("file-name");
const fileSizeEl = document.getElementById("file-size");
const splatCountEl = document.getElementById("splat-count");
const loadTimeEl = document.getElementById("load-time");
const boundsEl = document.getElementById("bounds");
const logEl = document.getElementById("log");

const logBuffer = [];
const appendLog = (message) => {
  const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBuffer.unshift(entry);
  logBuffer.length = Math.min(logBuffer.length, 14);
  logEl.textContent = logBuffer.join("\n");
  console.info(message);
};

const setStatus = (message) => {
  statusEl.textContent = message;
  appendLog(message);
};

const resetInfo = () => {
  fileNameEl.textContent = "-";
  fileSizeEl.textContent = "-";
  splatCountEl.textContent = "-";
  loadTimeEl.textContent = "-";
  boundsEl.textContent = "-";
};

resetInfo();
setStatus("等待文件...");

// Three + Spark setup
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0c1018");

const renderer = new THREE.WebGLRenderer({
  antialias: false,
  alpha: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, 1, 0.01, 500);
camera.position.set(0.5, 0.5, 2.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

const spark = new SparkRenderer({ renderer });
scene.add(spark);

// Provide a simple ground for orientation
const grid = new THREE.GridHelper(2.5, 10, 0x2a2f3a, 0x151822);
grid.position.y = -0.5;
scene.add(grid);

let currentMesh = null;

const resize = () => {
  const { clientWidth, clientHeight } = viewerEl;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
};

window.addEventListener("resize", resize);
resize();

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};
animate();

// Helpers
const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
};

const formatVec3 = (vec) =>
  `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;

const fitViewToMesh = (mesh) => {
  if (!mesh.getBoundingBox) return;
  const box = mesh.getBoundingBox();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const radius = Math.max(size.length() * 0.5, 0.5);
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360);

  camera.position.copy(center).add(new THREE.Vector3(dist, dist, dist));
  camera.near = Math.max(0.01, radius * 0.01);
  camera.far = Math.max(dist * 4, radius * 8);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();

  boundsEl.textContent = `${formatVec3(center)} | size ${formatVec3(size)}`;
};

const updateInfo = ({ file, mesh, loadMs }) => {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  splatCountEl.textContent = mesh?.packedSplats?.numSplats ?? "-";
  loadTimeEl.textContent = `${loadMs.toFixed(1)} ms`;
};

const removeCurrentMesh = () => {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh = null;
  }
};

const loadSplatFile = async (file) => {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".ply")) {
    setStatus("只支持 .ply 3DGS 文件");
    return;
  }

  try {
    setStatus("读取本地文件...");
    const start = performance.now();
    const bytes = new Uint8Array(await file.arrayBuffer());

    setStatus("解析 PLY 并构建 splats...");
    const mesh = new SplatMesh({
      fileBytes: bytes,
      fileType: SplatFileType.PLY,
      fileName: file.name,
    });
    await mesh.initialized;

    removeCurrentMesh();
    currentMesh = mesh;
    viewerEl.classList.add("has-mesh");
    scene.add(mesh);

    fitViewToMesh(mesh);
    spark.update({ scene });

    const loadMs = performance.now() - start;
    updateInfo({ file, mesh, loadMs });
    setStatus("加载完成，拖拽鼠标旋转 / 滚轮缩放");
    appendLog(
      `调试: splats=${mesh.packedSplats.numSplats}, bbox=${boundsEl.textContent}`,
    );
  } catch (error) {
    console.error(error);
    setStatus("加载失败，请检查文件或控制台日志");
  }
};

// Drag + click handlers
const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

["dragenter", "dragover"].forEach((eventName) => {
  viewerEl.addEventListener(eventName, (event) => {
    preventDefaults(event);
    viewerEl.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  viewerEl.addEventListener(eventName, (event) => {
    preventDefaults(event);
    if (eventName === "dragleave") {
      viewerEl.classList.remove("dragging");
    }
  });
});

viewerEl.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  viewerEl.classList.remove("dragging");
  loadSplatFile(file);
});

pickBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) {
    loadSplatFile(file);
    fileInput.value = "";
  }
});
