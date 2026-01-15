# Mô phỏng hệ thống thang máy trong tòa nhà cao tầng

## 1. Vấn đề
Khi xây dựng các tòa nhà cao tầng, việc có số lượng thang máy vừa đủ là rất quan trọng vì:
* Nếu số thang máy quá nhỏ thì sẽ dễ dẫn đến ùn tắc, chờ đợi lâu
* Nếu số lượng thang máy quá lớn thì chi phí đầu tư xây dựng và bảo trì sẽ tăng lên

## 2. Các thành phần trong hệ thống và chức năng của chúng
### Những người dùng thang máy
Đưa ra yêu cầu cho sảnh chờ, rồi khi vào thang máy thì đưa ra yêu cầu cho thang máy

### Bộ điều phối (Dispatcher):
* Nhận yêu cầu từ các sảnh chờ
* Tính toán thang máy có "khoảng cách" gần nhất cho mỗi yêu cầu (sử dụng công thức khoảng cách đặc biệt)
* Gán yêu cầu cho thang máy phù hợp nhất

**Công thức khoảng cách:**
- Nếu thang đang đi **LÊN**: 
  - Tầng phía trên có người muốn lên (cùng hướng) → điểm = khoảng cách
  - Các trường hợp khác → điểm = 2 × số tầng + khoảng cách
- Nếu thang đang đi **XUỐNG**: 
  - Tầng phía dưới có người muốn xuống (cùng hướng) → điểm = khoảng cách
  - Các trường hợp khác → điểm = 2 × số tầng + khoảng cách
- Nếu thang **RẢNH**: điểm = khoảng cách

Thang máy có điểm số thấp nhất sẽ được chọn để phục vụ yêu cầu đó.

### (Các) thang máy:
* Tiếp nhận yêu cầu nội bộ: Nhận yêu cầu "chọn tầng" từ người bên trong (lưu vào danh sách các yêu cầu bên trong).
* Tiếp nhận yêu cầu ngoại bộ: Nhận yêu cầu được gán từ Bộ điều phối.
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

Thang máy xử lý di chuyển theo yêu cầu của người dùng và các yêu cầu được gán từ Bộ điều phối. 
Khi ở trạng thái 'rảnh', thang máy sẽ chờ yêu cầu được gán từ Bộ điều phối hoặc yêu cầu từ người trong thang. 
Khi không "rảnh", thang máy ưu tiên xử lý các yêu cầu từ bên trong thang máy trước, 
nhưng vẫn dừng lại ở các tầng có yêu cầu được gán nếu đi qua và có thể đón thêm người.

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

### **Bộ điều phối (Dispatcher)**

Bộ điều phối chịu trách nhiệm phân bổ yêu cầu từ sảnh chờ cho thang máy phù hợp nhất dựa trên công thức khoảng cách đặc biệt.

```mermaid
flowchart TD
    A((Bắt đầu - Mỗi frame)) --> B{Có sảnh chờ nào có yêu cầu chưa được gán?}
    B -- Không --> Z((Kết thúc))
    B -- Có --> C[Lấy sảnh chờ tiếp theo có yêu cầu chưa gán]
    
    C --> D{Loại yêu cầu?}
    D -- UP --> E[Duyệt qua tất cả thang máy]
    D -- DOWN --> E
    
    E --> F[Tính điểm khoảng cách cho mỗi thang máy]
    F --> G{Thang đang LÊN?}
    
    G -- Có --> H{Tầng phía trên && cùng hướng UP?}
    H -- Có --> I[Điểm = khoảng cách]
    H -- Không --> J[Điểm = 2 × số tầng + khoảng cách]
    
    G -- Không --> K{Thang đang XUỐNG?}
    K -- Có --> L{Tầng phía dưới && cùng hướng DOWN?}
    L -- Có --> I
    L -- Không --> J
    
    K -- Không --> M[Thang RẢNH: Điểm = khoảng cách]
    
    I --> N[So sánh với điểm tốt nhất]
    J --> N
    M --> N
    
    N --> O{Đã duyệt hết thang máy?}
    O -- Chưa --> F
    O -- Rồi --> P[Gán yêu cầu cho thang có điểm thấp nhất]
    P --> Q[Đánh dấu yêu cầu đã được gán]
    Q --> B
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

### **Các biểu đồ chi tiết (tách từ biểu đồ tổng quan)**

#### **4.1. Biểu đồ xử lý yêu cầu được gán từ Bộ điều phối**

Biểu đồ này mô tả cách thang máy xử lý yêu cầu được gán từ Bộ điều phối khi đang ở trạng thái 'rảnh'.

```mermaid
flowchart TD
    A((Bắt đầu - Trạng thái rảnh)) --> B{Có yêu cầu được gán từ dispatcher?}
    B -- Có --> C[Lấy yêu cầu gần nhất theo công thức khoảng cách]
    B -- Không --> I[Giữ nguyên TrangThai = 'rảnh']
    C --> K{Tầng yêu cầu == tầng hiện tại?}
    K -- Có --> D[Mở cửa và chờ]
    K -- Không --> L[Di chuyển đến tầng yêu cầu]
    L --> E1[Chuyển sang xử lý di chuyển]
    D --> E2[Chuyển sang kiểm tra tải trọng]
    I --> F((Kết thúc))
```

#### **4.2. Biểu đồ kiểm tra mở/đóng cửa và tải trọng**

Biểu đồ này mô tả quá trình mở cửa, kiểm tra tải trọng và đóng cửa của thang máy.

```mermaid
flowchart TD
    A((Bắt đầu - Đến tầng cần dừng)) --> D[Mở cửa và chờ một khoảng thời gian]
    D --> E{Khối lượng có quá tải không?}
    E -- Có --> F[Thông báo quá tải và chờ]
    F --> E
    E -- Không --> G[Đóng cửa]
    G --> H{Danh sách chờ rỗng?}
    H -- Có --> I[TrangThai = 'rảnh']
    I --> Z((Kết thúc - Chờ yêu cầu mới))
    H -- Không --> T[Tiếp tục xử lý di chuyển]
    T --> Z2((Kết thúc - Tiếp tục di chuyển))
```

#### **4.3. Biểu đồ di chuyển và kiểm tra tầng**

Biểu đồ này mô tả logic di chuyển của thang máy giữa các tầng và kiểm tra yêu cầu từ sảnh chờ trên đường đi.

```mermaid
flowchart TD
    A((Bắt đầu - Có danh sách chờ)) --> T[So sánh tầng đầu tiên trong danh sách chờ với tầng hiện tại]
    T -- Bằng --> P[Xóa tầng hiện tại khỏi danh sách chờ]
    P --> D[Mở cửa và chờ]
    T -- Nhỏ hơn --> M[TrangThai = 'xuống']
    T -- Lớn hơn --> N[TrangThai = 'lên']
    M --> Q[Tầng hiện tại -= 1]
    N --> R[Tầng hiện tại += 1]
    Q --> O{Sảnh chờ tầng hiện tại có yêu cầu cùng hướng?}
    R --> O
    O -- Có --> S{Tầng hiện tại == tầng đầu tiên trong danh sách?}
    S -- Có --> P
    S -- Không --> D
    O -- Không --> T
    D --> Z((Kết thúc - Xử lý mở cửa))
```

#### **4.4. Biểu đồ xử lý yêu cầu từ người dùng bên trong thang máy**

Biểu đồ này mô tả cách thang máy xử lý các yêu cầu chọn tầng từ người dùng bên trong.

```mermaid
flowchart TD
    A((Bắt đầu)) --> W{Có yêu cầu từ người dùng bên trong?}
    W -- Có --> X{TrangThai?}
    W -- Không --> Z((Kết thúc))
    
    X -- Lên --> Y{Tầng yêu cầu > Tầng hiện tại?}
    Y -- Có --> U[Đưa tầng yêu cầu vào danh sách chờ và sắp xếp]
    Y -- Không --> IgnoreUp[Bỏ qua yêu cầu]
    
    X -- Xuống --> Z2{Tầng yêu cầu < Tầng hiện tại?}
    Z2 -- Có --> U
    Z2 -- Không --> IgnoreDown[Bỏ qua yêu cầu]
    
    X -- Rảnh --> V{So sánh tầng yêu cầu với tầng hiện tại}
    V -- Lớn hơn --> v[TrangThai = 'lên']
    V -- Nhỏ hơn --> w[TrangThai = 'xuống']
    V -- Bằng --> OpenDoor[Mở cửa ngay]
    v --> U
    w --> U
    
    U --> c{TrangThai == 'rảnh'?}
    c -- Có --> Continue[Bắt đầu di chuyển]
    c -- Không --> Continue2[Tiếp tục di chuyển theo hướng hiện tại]
    
    IgnoreUp --> Z
    IgnoreDown --> Z
    OpenDoor --> Z
    Continue --> Z
    Continue2 --> Z
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
