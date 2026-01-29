# Nitrate Grain

[English](README_en.md) | [简体中文](README.md)

**Nitrate Grain** 是一个运行在 Web 端的 RAW 图像编辑器和色彩分级工具。这是一个出于个人兴趣的探索性项目。

## ⚠️ 免责声明

本项目是一个实验性项目，由 **jules** 编写，**vibe coding** 开发。
目前整体功能可用，但不保证应用的稳定性或质量。同时，**不保证**图像处理流程（尤其是色彩处理流程）的百分百正确性。请勿用于关键的生产环境。

## ℹ️ 项目背景

本项目是 [Raw-Alchemy](https://github.com/shenmintao/raw-alchemy) 的二次开发版本（Fork）。我们保留了原项目的核心理念，并将其移植到了 Web 平台，旨在探索基于浏览器的 RAW 图像处理可能性。

## ✨ 功能特性

-   **RAW 处理**: 支持多种 RAW 格式 (ARW, CR2, DNG 等)，基于 LibRaw (WASM) 技术。
-   **色彩分级**: 支持加载 3D LUT (.cube) 文件，支持 Log 色彩空间转换。
-   **本地图库**: 内置基于 IndexedDB 的持久化图库，支持缩略图查看。
-   **PWA 支持**: 支持安装为渐进式 Web 应用 (PWA)，支持离线使用，并支持 Share Target API (从其他应用分享图片到本应用)。
-   **本地处理**: 所有图像处理均在本地浏览器中完成，无需上传到服务器。

## 🚀 部署指南 (Vercel)

本项目支持一键部署到 Vercel。以下是针对 `main` 主分支的部署流程：

1.  将本项目 Fork 到你的 GitHub 账号。
2.  登录 [Vercel Dashboard](https://vercel.com/dashboard) 并点击 **"Add New..."** -> **"Project"**.
3.  选择你 Fork 的 `raw-alchemy` 仓库并点击 **"Import"**.
4.  在 **"Configure Project"** 页面进行如下设置：
    *   **Framework Preset**: 选择 `Vite`.
    *   **Root Directory**: 点击 Edit，选择 `raw-alchemy-web` 目录 (因为 Web 项目位于该子目录下)。
5.  点击 **"Deploy"**.

Vercel 将会自动安装依赖、构建项目并发布。部署完成后，你将获得一个访问链接。

## 🙏 致谢

感谢以下项目和个人的贡献：

-   **Raw-Alchemy**: 本项目的原身，感谢原作者的开源精神。
-   **jules**: 本项目的主要编写者。
-   **LibRaw-Wasm**: 特别感谢 [Steve-Mr/LibRaw-Wasm](https://github.com/Steve-Mr/LibRaw-Wasm) 提供的 WASM 构建，实现了高效的缩略图提取。
-   **开源社区**: 感谢 React, Vite, Tailwind CSS, Lucide 等优秀的开源项目。
