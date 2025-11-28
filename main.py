import tkinter as tk
import random

NUM_FLOORS = 10
NUM_ELEVATORS = 5
ELEVATOR_CAPACITY = 8
PASSENGER_RATE = 1
TICK_MS = 100

WINDOW_WIDTH = 1000
WINDOW_HEIGHT = 800
FLOOR_HEIGHT = 40
ELEV_WIDTH = 40


class Person:
    def __init__(self, start_floor, dest_floor, spawn_time):
        self.start_floor = start_floor
        self.dest_floor = dest_floor
        self.spawn_time = spawn_time
        self.direction = 1 if dest_floor > start_floor else -1


class Elevator:
    def __init__(self, env, id):
        self.env = env
        self.id = id
        self.current_floor = 0.0  # Float để di chuyển mượt
        self.target_floor = None
        self.state = 'IDLE'  # IDLE, MOVING_UP, MOVING_DOWN, LOADING
        self.passengers = []  # Danh sách người trong thang
        self.internal_requests = set()  # Các tầng người trong thang muốn đến
        self.timer = 0  # Dùng để đếm thời gian mở cửa

    def get_direction(self):
        if self.state == 'MOVING_UP':
            return 1
        if self.state == 'MOVING_DOWN':
            return -1
        return 0

    def step(self):
        # Logic mô phỏng theo biểu đồ luồng trong README
        current_floor_int = int(round(self.current_floor))

        # 1. Trạng thái LOADING (Mở cửa/Đóng cửa)
        if self.state == 'LOADING':
            self.timer += 1
            if self.timer > 10:  # Giả lập thời gian chờ
                self.handle_boarding(current_floor_int)
                if len(self.passengers) == 0 and len(self.internal_requests) == 0 and self.env.no_external_requests():
                    self.state = 'IDLE'
                else:
                    self.decide_next_move(current_floor_int)
            return

        # 2. Logic di chuyển và quyết định dừng
        # Kiểm tra xem có cần dừng tại tầng hiện tại không (khi thang đi ngang qua)
        if abs(self.current_floor - current_floor_int) < 0.1:
            should_stop = self.check_stop_condition(current_floor_int)
            if should_stop:
                self.current_floor = float(current_floor_int)  # Snap vào tầng
                self.state = 'LOADING'
                self.timer = 0
                return

        # 3. Thực hiện di chuyển
        if self.state == 'MOVING_UP':
            self.current_floor += 0.1
            if self.current_floor >= NUM_FLOORS - 1:
                self.current_floor = NUM_FLOORS - 1
                self.state = 'LOADING'
        elif self.state == 'MOVING_DOWN':
            self.current_floor -= 0.1
            if self.current_floor <= 0:
                self.current_floor = 0
                self.state = 'LOADING'
        elif self.state == 'IDLE':
            self.decide_next_move(current_floor_int)

    def check_stop_condition(self, floor):
        # Dừng nếu:
        # 1. Có người trong thang muốn ra tại đây
        if floor in self.internal_requests:
            return True

        # 2. Thang chưa đầy VÀ có người ở sảnh muốn đi cùng chiều
        if len(self.passengers) < ELEVATOR_CAPACITY:
            direction = self.get_direction()
            if direction == 1 and self.env.floors[floor].has_up_request():
                return True
            if direction == -1 and self.env.floors[floor].has_down_request():
                return True
            # Nếu đang IDLE hoặc chuyển hướng, đón bất kỳ ai
            if self.state == 'IDLE' and (self.env.floors[floor].has_up_request() or self.env.floors[floor].has_down_request()):
                return True

        return False

    def handle_boarding(self, floor):
        # Cho khách ra
        leaving = [p for p in self.passengers if p.dest_floor == floor]
        for p in leaving:
            self.passengers.remove(p)
            # Ghi nhận thời gian chờ + đi
            self.env.completed_trips.append(self.env.time - p.spawn_time)
        self.internal_requests.discard(floor)

        # Cho khách vào (Logic Input/Output từ README)
        floor_obj = self.env.floors[floor]

        # Xác định hướng đón khách
        pickup_dir = 0
        if self.state == 'MOVING_UP' or (self.state == 'LOADING' and self.target_floor is not None and self.target_floor > floor):
            pickup_dir = 1
        elif self.state == 'MOVING_DOWN' or (self.state == 'LOADING' and self.target_floor is not None and self.target_floor < floor):
            pickup_dir = -1
        else:
            # Nếu thang rảnh, ưu tiên hướng nào đông hơn hoặc mặc định
            if len(floor_obj.up_queue) > len(floor_obj.down_queue):
                pickup_dir = 1
            elif len(floor_obj.down_queue) > 0:
                pickup_dir = -1
            elif len(floor_obj.up_queue) > 0:
                pickup_dir = 1

        # Nạp khách
        if pickup_dir == 1:
            while len(floor_obj.up_queue) > 0 and len(self.passengers) < ELEVATOR_CAPACITY:
                p = floor_obj.up_queue.pop(0)
                self.passengers.append(p)
                self.internal_requests.add(p.dest_floor)
        elif pickup_dir == -1:
            while len(floor_obj.down_queue) > 0 and len(self.passengers) < ELEVATOR_CAPACITY:
                p = floor_obj.down_queue.pop(0)
                self.passengers.append(p)
                self.internal_requests.add(p.dest_floor)

    def decide_next_move(self, current_floor):
        # Đơn giản hóa logic điều hướng:
        # Nếu có yêu cầu bên trong, tiếp tục đi đến đó.
        # Nếu không, tìm tầng gần nhất có người gọi.

        if self.internal_requests:
            # Logic đơn giản: tiếp tục hướng hiện tại nếu có request, nếu không đảo chiều
            if self.state == 'MOVING_UP' and any(f > current_floor for f in self.internal_requests):
                self.state = 'MOVING_UP'
            elif self.state == 'MOVING_DOWN' and any(f < current_floor for f in self.internal_requests):
                self.state = 'MOVING_DOWN'
            else:
                # Tìm tầng gần nhất trong internal
                next_stop = min(self.internal_requests,
                                key=lambda x: abs(x - current_floor))
                if next_stop > current_floor:
                    self.state = 'MOVING_UP'
                elif next_stop < current_floor:
                    self.state = 'MOVING_DOWN'
                else:
                    self.state = 'LOADING'  # Đã ở đúng tầng
            return

        # Nếu rỗng ruột, tìm khách bên ngoài
        target = self.env.find_nearest_request(current_floor)
        if target is not None:
            self.target_floor = target
            if target > current_floor:
                self.state = 'MOVING_UP'
            elif target < current_floor:
                self.state = 'MOVING_DOWN'
            else:
                self.state = 'LOADING'
        else:
            self.state = 'IDLE'
            self.target_floor = None


class Floor:
    def __init__(self, level):
        self.level = level
        self.up_queue = []   # Danh sách người chờ lên
        self.down_queue = []  # Danh sách người chờ xuống

    def has_up_request(self): return len(self.up_queue) > 0
    def has_down_request(self): return len(self.down_queue) > 0


class SimulationEnv:
    def __init__(self):
        self.floors = [Floor(i) for i in range(NUM_FLOORS)]
        self.elevators = [Elevator(self, i) for i in range(NUM_ELEVATORS)]
        self.time = 0
        self.completed_trips = []  # Lưu thời gian hoàn thành để tính trung bình
        self.avg_wait_history = []  # Dữ liệu cho biểu đồ

    def no_external_requests(self):
        for f in self.floors:
            if f.has_up_request() or f.has_down_request():
                return False
        return True

    def find_nearest_request(self, current_floor):
        # Tìm tầng gần nhất có người chờ
        closest_dist = 999
        target = None
        for f in self.floors:
            if f.has_up_request() or f.has_down_request():
                dist = abs(f.level - current_floor)
                if dist < closest_dist:
                    closest_dist = dist
                    target = f.level
        return target

    def update(self):
        self.time += 1

        # 1. Sinh người ngẫu nhiên (Input: Trung bình số người đến)
        if random.random() < PASSENGER_RATE:
            start = random.randint(0, NUM_FLOORS - 1)
            dest = random.randint(0, NUM_FLOORS - 1)
            while dest == start:
                dest = random.randint(0, NUM_FLOORS - 1)

            p = Person(start, dest, self.time)
            if dest > start:
                self.floors[start].up_queue.append(p)
            else:
                self.floors[start].down_queue.append(p)

        # 2. Cập nhật thang máy
        for elev in self.elevators:
            elev.step()

        # 3. Cập nhật thống kê
        if self.time % 20 == 0:  # Cập nhật mỗi 2 giây giả lập
            avg = 0
            if self.completed_trips:
                avg = sum(self.completed_trips) / len(self.completed_trips)
            self.avg_wait_history.append(avg)
            if len(self.avg_wait_history) > 50:
                self.avg_wait_history.pop(0)

# --- GIAO DIỆN ĐỒ HỌA (GUI) ---


class ElevatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Mô phỏng Hệ thống Thang máy")
        self.sim = SimulationEnv()

        # Layout chính
        self.main_frame = tk.Frame(root)
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # PHẦN 1: GIAO DIỆN MÔ PHỎNG (Top half of Sketch)
        self.canvas_sim = tk.Canvas(
            self.main_frame, width=WINDOW_WIDTH, height=WINDOW_HEIGHT*0.6, bg="white")
        self.canvas_sim.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # PHẦN 2: GIAO DIỆN THỐNG KÊ (Bottom half of Sketch)
        self.stats_frame = tk.Frame(
            self.main_frame, height=WINDOW_HEIGHT*0.4, bg="#f0f0f0")
        self.stats_frame.pack(side=tk.BOTTOM, fill=tk.BOTH, expand=True)

        # Biểu đồ trái (Thời gian chờ)
        self.canvas_chart1 = tk.Canvas(
            self.stats_frame, bg="white", width=WINDOW_WIDTH/2, height=250)
        self.canvas_chart1.pack(side=tk.LEFT, padx=10, pady=10)

        # Biểu đồ phải (Số người chờ mỗi tầng)
        self.canvas_chart2 = tk.Canvas(
            self.stats_frame, bg="white", width=WINDOW_WIDTH/2, height=250)
        self.canvas_chart2.pack(side=tk.RIGHT, padx=10, pady=10)

        self.animate()

    def draw_simulation(self):
        self.canvas_sim.delete("all")

        # Vẽ các tầng
        for i in range(NUM_FLOORS):
            y = 50 + (NUM_FLOORS - 1 - i) * FLOOR_HEIGHT
            self.canvas_sim.create_line(
                50, y + FLOOR_HEIGHT, WINDOW_WIDTH - 50, y + FLOOR_HEIGHT, fill="gray")
            self.canvas_sim.create_text(
                30, y + FLOOR_HEIGHT/2, text=f"Tầng {i}")

            # Vẽ người chờ (Người que đơn giản)
            f = self.sim.floors[i]
            count_wait = len(f.up_queue) + len(f.down_queue)
            for p_idx in range(min(count_wait, 10)):  # Chỉ vẽ tối đa 10 người để đỡ rối
                px = 100 + p_idx * 15
                py = y + FLOOR_HEIGHT - 10
                # Đầu
                self.canvas_sim.create_oval(
                    px-3, py-15, px+3, py-9, outline="black")
                # Thân
                self.canvas_sim.create_line(px, py-9, px, py, fill="black")
                # Chân
                self.canvas_sim.create_line(px, py, px-3, py+5, fill="black")
                self.canvas_sim.create_line(px, py, px+3, py+5, fill="black")

            if count_wait > 0:
                self.canvas_sim.create_text(
                    80, y + FLOOR_HEIGHT/2, text=f"{count_wait}", fill="red")

        # Vẽ thang máy
        shaft_spacing = 150
        start_x_shafts = 300
        for i, elev in enumerate(self.sim.elevators):
            x = start_x_shafts + i * shaft_spacing
            # Vẽ trục thang máy
            self.canvas_sim.create_rectangle(
                x, 50, x + ELEV_WIDTH, 50 + NUM_FLOORS*FLOOR_HEIGHT, outline="gray", dash=(4, 4))

            # Tính vị trí thang máy
            elev_y = 50 + (NUM_FLOORS - 1 - elev.current_floor) * FLOOR_HEIGHT

            color = "green" if elev.state == 'IDLE' else "blue"
            if elev.passengers:
                color = "orange"  # Có người
            if len(elev.passengers) == ELEVATOR_CAPACITY:
                color = "red"  # Quá tải

            self.canvas_sim.create_rectangle(
                x, elev_y, x + ELEV_WIDTH, elev_y + FLOOR_HEIGHT, fill=color, outline="black")

            # Thông tin trên thang
            info = f"{len(elev.passengers)}/{ELEVATOR_CAPACITY}"
            self.canvas_sim.create_text(
                x + ELEV_WIDTH/2, elev_y + FLOOR_HEIGHT/2, text=info, fill="white", font=("Arial", 8))

            # Mũi tên hướng
            if elev.state == 'MOVING_UP':
                self.canvas_sim.create_text(
                    x + ELEV_WIDTH/2, elev_y - 10, text="▲", fill="blue")
            elif elev.state == 'MOVING_DOWN':
                self.canvas_sim.create_text(
                    x + ELEV_WIDTH/2, elev_y + FLOOR_HEIGHT + 10, text="▼", fill="blue")

    def draw_charts(self):
        # --- Biểu đồ 1: Thời gian chờ trung bình (Line Chart) ---
        self.canvas_chart1.delete("all")
        self.canvas_chart1.create_text(
            200, 15, text="Biểu đồ thời gian chờ trung bình", font=("Arial", 10, "bold"))

        w = int(self.canvas_chart1['width'])
        h = int(self.canvas_chart1['height'])
        data = self.sim.avg_wait_history
        if len(data) > 1:
            max_val = max(data) if max(data) > 0 else 1
            step_x = (w - 40) / len(data)

            prev_x, prev_y = 20, h - 20 - (data[0] / max_val * (h - 50))
            for i in range(1, len(data)):
                curr_x = 20 + i * step_x
                curr_y = h - 20 - (data[i] / max_val * (h - 50))
                self.canvas_chart1.create_line(
                    prev_x, prev_y, curr_x, curr_y, fill="blue", width=2)
                prev_x, prev_y = curr_x, curr_y

        # --- Biểu đồ 2: Số người chờ mỗi tầng (Bar Chart) ---
        self.canvas_chart2.delete("all")
        self.canvas_chart2.create_text(
            200, 15, text="Biểu đồ số người chờ ở mỗi tầng", font=("Arial", 10, "bold"))

        w = int(self.canvas_chart2['width'])
        h = int(self.canvas_chart2['height'])
        bar_width = (w - 40) / NUM_FLOORS

        counts = [len(f.up_queue) + len(f.down_queue) for f in self.sim.floors]
        max_count = max(counts) if max(counts) > 0 else 1

        for i, count in enumerate(counts):
            x0 = 20 + i * bar_width + 5
            bar_h = (count / max_count) * (h - 50)
            y0 = h - 20 - bar_h
            x1 = x0 + bar_width - 10
            y1 = h - 20
            self.canvas_chart2.create_rectangle(
                x0, y0, x1, y1, fill="orange", outline="black")
            self.canvas_chart2.create_text((x0+x1)/2, y1 + 10, text=f"{i}")

    def animate(self):
        self.sim.update()
        self.draw_simulation()
        self.draw_charts()
        self.root.after(TICK_MS, self.animate)


if __name__ == "__main__":
    root = tk.Tk()
    app = ElevatorApp(root)
    root.mainloop()
