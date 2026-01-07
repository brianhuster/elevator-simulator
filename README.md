# Mô phỏng hệ thống thang máy trong tòa nhà cao tầng

## 1. Vấn đề
Khi xây dựng các tòa nhà cao tầng, việc có số lượng thang máy vừa đủ là rất quan trọng vì:
* Nếu số thang máy quá nhỏ thì sẽ dễ dẫn đến ùn tắc, chờ đợi lâu
* Nếu số lượng thang máy quá lớn thì chi phí đầu tư xây dựng và bảo trì sẽ tăng lên

## 2. Các thành phần trong hệ thống và chức năng của chúng
### Những người dùng thang máy
Đưa ra yêu cầu cho sảnh chờ, rồi khi vào thang máy thì đưa ra yêu cầu cho thang máy

### (Các) thang máy:
* Tiếp nhận yêu cầu nội bộ: Nhận yêu cầu "chọn tầng" từ người bên trong (lưu vào danh sách các yêu cầu bên trong).
* Tiếp nhận yêu cầu ngoại bộ: Nhận yêu cầu "dừng" từ Hệ thống hoặc Sảnh chờ khi thang máy đi qua tầng có người đang chờ.
* Kiểm tra tải trọng
* Di chuyển theo yêu cầu của hệ thống và người dùng

###	Sảnh chờ :
Tiếp nhận yêu cầu của người dùng (lên, xuống hay cả 2)

## 3. Input và output
### Các biến input:
* Trung bình số người đến tại mỗi tầng trong một đơn vị thời gian
* Số người chứa được trong mỗi thang máy
* Số thang máy
* Số tầng
### Các giá trị output:
* Số người chờ tại mỗi tầng
* Thời gian chờ trung bình
* Hiệu suất

## 4. Sơ đồ luồng hệ thống

### **Thang máy (Elevator)**

Thang máy xử lý di chuyển theo yêu cầu của người dùng và sảnh chờ. Khi ở trạng
thái 'rảnh', thang máy sẽ chờ yêu cầu từ sảnh chờ hoặc người trong thang. Tuy
nhiên, khi nó không "rảnh", thang máy sẽ không chờ yêu cầu từ sảnh chờ nữa mà
chỉ xử lý các yêu cầu từ bên trong thang máy. Tuy vậy, nó vẫn kiểm tra trạng
thái của sảnh chờ ở mỗi tầng nó đi qua để đáp ứng yêu cầu của sảnh chờ.

(Vui lòng xem sơ đồ ở trang sau)

```mermaid
flowchart TD
    A((bắt đầu)) --> a[Xác định tầng hiện tại] --> I
    B{"Có yêu cầu S từ sảnh chờ"}
    B --> K{St == tầng hiện tại?}
    K -- có --> D[Mở cửa ra và chờ một khoảng thời gian]
    D --> E{Khối lượng có quá tải không?}
    K -- không --> L[Đưa yêu cầu S vào danh sách chờ] --> T
    E -- Có --> F[Thông báo quá tải và chờ]
    F --> E
    E -- Không --> G[Đóng cửa]
    G --> H{Danh sách chờ rỗng?}
    H -- Có --> I[TrangThai = 'rảnh'] --> B
    H -- Không --> T
    T[So sánh tầng đầu tiên trong danh sách chờ với tầng hiện tại] -- Bằng --> P[Xóa tầng hiện tại khỏi danh sách chờ] --> D
    T -- Nhỏ hơn --> M[TrangThai = 'xuống'] --> Q[Tầng hiện tại -= 1]
    T -- Lớn hơn --> N[TrangThai = 'lên'] --> R[Tầng hiện tại += 1]
    Q --> O{Sảnh chờ tầng hiện đại có yêu cầu cùng hướng di chuyển với TrangThai không?}
    R --> O
    O -- Có --> S{Tầng hiện tại bằng tầng đầu tiên trong danh sách chờ} --có--> P
    O -- Không --> T
    S -- Không --> D


    W{Có yêu cầu từ người dùng bên trong}
    W --> X{TrangThai}
    X -- lên --> Y{Tầng yêu cầu > Tầng hiện tại?}
    Y -- Có --> U[Đưa tầng yêu cầu vào danh sách chờ và sắp xếp theo thứ tự khoảng cách đường đi]
    X -- Xuống --> Z{Tầng yêu cầu < Tầng hiện tại?}
    Z -- Có --> U[Đưa tầng yêu cầu vào danh sách chờ, deduplicate và sắp xếp theo khoảng cách đến tầng hiện tại]
    X -- Rảnh --> V{So sánh tầng yêu cầu với tầng hiện tại} 
    V -- Lớn hơn --> v[TrangThai = 'lên'] --> U
    V -- Nhỏ hơn --> w[TrangThai = 'xuống'] --> U
    U --> c{TrangThai == 'rảnh'?} -- có --> T
```

### **Sảnh chờ / Tầng (Floor)**

Sảnh chờ hoạt động khá đơn giản, khi người dùng nhấn nút Up hoặc Down thì trạng
thái của nút đó sẽ thành True (hoặc giữ nguyên là True). Khi thang máy đáp ứng
yêu cầu của sảnh chờ đến và mở cửa thì yêu cầu tương ứng sẽ được đặt lại thành
False.

(Vui lòng xem sơ đồ ở trang sau)

```mermaid
flowchart TD
A((Define up = false, down = false))
A --> B{Người dùng ấn nút}
B -- up --> C{up == false} --> D[up = true] --> E[Gửi yêu cầu, bao gồm số tầng, hướng yêu cầu đến bộ điều phối]
B -- down --> F{down == false} --> G[down = true] --> E
A --> H{Có thang máy đến tầng hiện tại và mở cửa}
H -- thang đi lên --> I[up = false]
H -- thang đi xuống --> J[down = false]
```

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
