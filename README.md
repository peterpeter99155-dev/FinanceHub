# FinanceHub

FinanceHub 是一套以淨資產為核心、單一使用者、本機優先的個人財務中控台。

產品的首要任務是協助使用者回答：

1. 我現在擁有多少淨資產？
2. 我的資產為什麼增加或減少？

## 目前階段

專案目前正在執行 Sprint 01，尚未開始處理真實財務資料。

## 核心方向

- 以淨資產與重要財務變化為核心。
- 抓大放小，不要求完整記錄每筆小額消費。
- 先建立可手動操作的財務底座，再逐步加入自動化。
- 所有自動結果都必須能由使用者修正。
- 初期採 Windows、單一使用者、本機優先。
- 真實財務資料、密碼與授權憑證不得提交至 Git。

## 正式文件

- [產品願景](docs/01_Product_Vision.md)
- [功能需求](docs/02_Requirements.md)
- [商業規則](docs/03_Business_Rules.md)
- [決策紀錄](docs/04_Decision_Log.md)
- [Sprint 01 規劃草案](docs/05_Sprint_01_Plan.md)
- [Sprint 01 Review](docs/06_Sprint_01_Review.md)

## 預定技術方向

- Electron
- React
- TypeScript
- Electron Forge

實際函式庫會在對應 Sprint 開始前確認，避免過早加入不必要的相依套件。

## 本機開發

需求：

- Node.js 24
- npm 11
- Windows 10 或 11

安裝與啟動：

```powershell
npm.cmd install
npm.cmd start
```

驗證：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run package
npm.cmd run test:e2e
```

> 目前資料庫尚未加密。正式加密完成前，只能使用假資料或匿名化資料，不得輸入真實金融資料。

端到端測試會啟動 Electron，必須先執行 `npm.cmd run package` 產生 Webpack 與 Windows 封裝產物。
