# Nitrate Grain

English | [简体中文](README.md)

**Nitrate Grain** is a RAW image editor and color grading tool for the web. This is an exploratory project created out of personal interest.

## ⚠️ Disclaimer

This is an experimental project written by **jules** and developed by **vibe coding**.
While the application is currently functional, there are no guarantees regarding its stability or quality. Furthermore, we **do not guarantee** that the image processing pipeline (especially the color processing pipeline) is 100% correct. Please do not use it for critical production environments.

## ℹ️ Project Background

This project is a secondary development (Fork) of [Raw-Alchemy](https://github.com/shenmintao/raw-alchemy). We retained the core philosophy of the original project and ported it to the Web platform, aiming to explore the possibilities of browser-based RAW image processing.

## ✨ Features

-   **RAW Processing**: Supports various RAW formats (ARW, CR2, DNG, etc.) powered by LibRaw (WASM).
-   **Color Grading**: Supports 3D LUT (.cube) files and Log color space transformations.
-   **Local Gallery**: Built-in persistent gallery based on IndexedDB with thumbnail support.
-   **PWA Support**: Installable as a Progressive Web App (PWA), works offline, and supports the Share Target API (share images from other apps to this one).
-   **Local Processing**: All image processing is done locally in your browser; no images are uploaded to any server.

## 🚀 Deployment Guide (Vercel)

This project supports one-click deployment to Vercel. Here is the deployment process for the `main` branch:

1.  Fork this repository to your GitHub account.
2.  Log in to the [Vercel Dashboard](https://vercel.com/dashboard) and click **"Add New..."** -> **"Project"**.
3.  Select your forked `raw-alchemy` repository and click **"Import"**.
4.  In the **"Configure Project"** page, apply the following settings:
    *   **Framework Preset**: Select `Vite`.
    *   **Root Directory**: Click Edit and select the `raw-alchemy-web` directory (since the web project is located in this subdirectory).
5.  Click **"Deploy"**.

Vercel will automatically install dependencies, build the project, and publish it. Once deployment is complete, you will get a live access link.

## 🙏 Acknowledgments

Thanks to the contributions of the following projects and individuals:

-   **Raw-Alchemy**: The original project. Thanks to the original author for the open-source spirit.
-   **jules**: The primary author of this project.
-   **LibRaw-Wasm**: Special thanks to [Steve-Mr/LibRaw-Wasm](https://github.com/Steve-Mr/LibRaw-Wasm) for providing the WASM build, enabling efficient thumbnail extraction.
-   **Open Source Community**: Thanks to excellent open source projects like React, Vite, Tailwind CSS, Lucide, etc.
