# ChatGPT 本機橋接

「ChatGPT · 本機橋接」是 Voyager 的官方外掛，預設關閉。

開啟並配對之後，Voyager 會把一組 ChatGPT 頁面操作開放給這台電腦上的本機程式。程式提出要做什麼，Voyager 就在自己開啟的分頁裡，用你瀏覽器裡已經登入的那個 ChatGPT 去做。ChatGPT 看到的，就是你瀏覽器裡一次普通的對話。

## 開放了哪些操作

- 開啟一個對話：新對話，或既有的對話
- 選擇模型：只在聊天模式下選，不會把 ChatGPT 切到「工作」模式
- 送出提示，可以附上附件
- 等待回覆，並讀出來
- 讀取既有對話的最新回覆
- 列出、建立專案
- 列出、上傳、刪除專案裡的檔案（刪除立即生效，無法復原）
- 立即重新取得頁面資料（Voyager 用來辨識 ChatGPT 頁面的站點資料），不必等下一次定時檢查

## 它守的規矩

**只在本機。** 橋接只透過 `127.0.0.1` 和本機程式通訊，而且要先配對。

**用自己的分頁。** 每個任務都在 Voyager 開啟的 ChatGPT 分頁裡進行，用完就關掉。

**預設一次一個任務。** 任務預設一個接一個執行。在彈出視窗的 **本機橋接** 卡片裡開啟 **並行執行任務**，再設好 **同時執行的任務數**（2 到 10，預設 3）；每個任務各用自己的分頁，輸入和點擊仍會輪流進行。並行需要 0.4.0 之後的 Voyager CLI；舊版 `voyager serve` 仍一次只跑一個任務。

**登入和人機驗證交給你。** 如果 ChatGPT 要求登入或人機驗證，橋接會停下來告訴你，不會繞過。

**附上方案。** 每個結果都會附上你的 ChatGPT 方案（`Pro Lite ($100)`、`Pro ($200)` 等），以頁面最近一次回報的為準。

**瀏覽器。** 已在 Chrome 中測試。Edge 和 Firefox 版的 Voyager 也內建這個橋接；Safari 版沒有。

## 參考用法：Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli)（npm 套件 `@voyager-crew/cli`，指令 `voyager`）是以這些操作寫成的參考用戶端：在終端機裡向 ChatGPT 提問，或交給你的 coding agent 去問。

### 三步接上

1. 安裝命令列（需要 Node.js 20.3 或更新版本）：

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. 在 Voyager 彈出視窗裡進入 **外掛**，開啟 **ChatGPT · 本機橋接**，並允許存取 chatgpt.com。
3. 配對一次：

   ```sh
   voyager pair
   ```

   把它顯示的 8 位配對碼填進彈出視窗裡「本機橋接」的設定。

### 幾個例子

```sh
voyager ask "解釋一下這段錯誤訊息" --attach crash.log
voyager ask --chat <連結|id> "邊界情況呢？"         # 在既有對話裡接著問
voyager read <連結|id>                             # 儲存某個對話的最新回答
voyager project upload "論文" ./thesis             # 把檔案放進專案，專案裡的對話都讀得到
voyager ask --project "論文" "論證最薄弱的地方在哪？"
voyager ask --drive ./paper.pdf "總結一下方法部分"  # 放到 Google Drive，讓 ChatGPT 自己的 Drive 應用程式去讀
voyager ask --repo owner/name "CI 為什麼掛了？"     # 讓 ChatGPT 自己的 GitHub 應用程式讀這個儲存庫
```

回答會存成 `response.md`，預設使用聊天模式下的 GPT-6 Pro。

這兩個選項都用 ChatGPT 自己的 Google Drive 和 GitHub 應用程式，請先在 ChatGPT 裡連結好；它們只是在提示裡多加幾句話，不需要新版 Voyager。`--drive` 用 rclone 把檔案傳到 `VOYAGER_DRIVE_REMOTE`（例如 `gdrive:Voyager`）下的一個新資料夾，這個 remote 必須和 ChatGPT 的 Drive 應用程式是同一個 Google 帳號；它沒有 `--attach` 的 64 MiB 上限，檔案傳完會留在 Drive 上。`--repo` 會請 ChatGPT 只往新建的 `chatgpt/*` 分支提交，這只是請求，不是限制：它的 GitHub 應用程式能寫進安裝範圍內的任何地方。ChatGPT 存取不到這個儲存庫時，voyager 會以結束代碼 3 停下，請到 [GitHub 的 installations 設定](https://github.com/settings/installations)把儲存庫加進去。

很長的回答怎麼等、每個結束代碼的意思、全部指令，請見 [CLI 的 README](https://github.com/voyager-crew/voyager-cli/blob/main/README_ZH.md)。給 Claude Code、Codex 等 agent 用的說明在 [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md)。

## 須知與免責

- Voyager 和 Voyager CLI 是社群開源專案，與 OpenAI 無關，也沒有獲得 OpenAI 的認可。
- 本機橋接會在你自己登入的瀏覽器中自動操作 ChatGPT 網頁版。OpenAI 的[使用條款](https://openai.com/policies/terms-of-use/)限制以自動或程式化的方式擷取輸出，使用前請自行判斷是否符合條款；帳號因此受到的任何限制，由你自行承擔。
- 同類工具也是這樣處理的：例如 [oracle](https://github.com/steipete/oracle) 把瀏覽器模式作為需要主動開啟的實驗功能，並建議在意風險的人改用 API。需要有保障的用法，請使用 OpenAI API。
- 本機橋接是給你在自己電腦上、為自己方便而用的：只連你自己的帳號，不要拿它對外提供服務、共享帳號或轉賣額度，也只用於合法用途。
