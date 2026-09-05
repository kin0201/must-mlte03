# quadsim — 環境安裝指引 / Environment Setup Guide

> MLTE03 全部實驗都在這個純 Python 模擬器裡完成。**Weeks 1–12 只需要
> `numpy` + `matplotlib`** —— 零重型依賴；MPC / RL 兩週的選配套件到時再裝。
> Everything runs locally; no GPU, no MATLAB, no internet needed after setup.

## 0. 需要什麼 / What you need

- **Python 3.10 或以上**（建議 3.11/3.12）。查看版本：`python3 --version`
  - Windows：從 <https://www.python.org/downloads/> 安裝，**勾選 "Add python.exe to PATH"**
  - macOS：`python3` 系統自帶即可（或 `brew install python`）
- 課程提供的 `simulator/` 資料夾（LMS 下載解壓，或課堂 USB）
- 任何編輯器（VS Code 推薦，免費）

## 1. 一次性安裝 / One-time setup

打開終端機（Windows：PowerShell；macOS：Terminal），`cd` 進 `simulator/` 資料夾：

**macOS / Linux**
```bash
cd simulator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Windows (PowerShell)**
```powershell
cd simulator
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> Windows 如出現「无法加载文件…禁止运行脚本」：先執行
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`，再 activate。

## 2. 每次開工 / Every session

```bash
cd simulator
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
export PYTHONPATH=.              # Windows: $env:PYTHONPATH="."
```

`PYTHONPATH=.` 讓 `import quadsim` 找得到模組 —— 每開一個新終端都要設。

## 3. 驗證安裝 / Verify

```bash
python examples/01_open_loop.py
```

看到 `final roll angle after 3 s open loop: 112.1 deg (it tips over)` 並生成
`open_loop.png` = 安裝成功。這也是 Week 1 實驗的第一步。

再快速自測（可選）：
```bash
python -m pytest tests -q        # 18 passed = 模擬器完好
```

## 4. 後半學期的選配套件 / Optional packages (install when told)

| 週 | 套件 | 指令 |
|---|---|---|
| W12 MPC（進階選項） | do-mpc + CasADi | `pip install do-mpc casadi` |

**注意：課程內建的 `LinearMPC` 完全不需要以上套件** —— 只有想
用工業級工具做期末專案的同學才需要裝。

## 5. 常見問題 / Troubleshooting

| 症狀 | 原因 → 解法 |
|---|---|
| `ModuleNotFoundError: No module named 'quadsim'` | 沒設 `PYTHONPATH=.`，或不在 `simulator/` 目錄下 |
| `ModuleNotFoundError: No module named 'numpy'` | venv 沒 activate（提示符前應有 `(.venv)`） |
| `python: command not found`（macOS） | 用 `python3` |
| 圖窗不彈出 | 遠端/無螢幕環境屬正常；改看生成的 `.png` 檔 |
| pip 下載慢（中國大陸網絡） | `pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple` |
| Apple Silicon 裝 numpy 報錯 | 升級 pip：`pip install --upgrade pip` 再重試 |

裝不起來？帶電腦來 office hour（星期一 9:00–12:00），或第一堂課現場處理。
