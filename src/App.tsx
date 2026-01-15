import { useState, useEffect, useRef } from 'react';

interface Config {
	NUM_FLOORS: number;
	NUM_ELEVATORS: number;
	ELEVATOR_CAPACITY: number; // kg
	PASSENGER_RATE: number; // số người xuất hiện mỗi giây
	FLOOR_HEIGHT_PX: number;
	ELEVATOR_SPEED: number; // tầng/giây
	LOADING_TIME: number; // giây
	MIN_WEIGHT: number; // kg
	MAX_WEIGHT: number; // kg
}

const FPS = 60;

let CONFIG: Config = {
	NUM_FLOORS: 10,
	NUM_ELEVATORS: 2,
	ELEVATOR_CAPACITY: 600, // 600 kg (khoảng 8-10 người)
	PASSENGER_RATE: 0.6, // 0.6 người/giây
	FLOOR_HEIGHT_PX: 50,
	ELEVATOR_SPEED: 1, // 1 tầng/giây (chậm hơn, mượt hơn)
	LOADING_TIME: 3, // 3 giây
	MIN_WEIGHT: 45, // 45 kg
	MAX_WEIGHT: 90, // 90 kg
};

const secondsToFrames = (seconds: number) => seconds * FPS;
const speedPerFrame = (speedPerSecond: number) => speedPerSecond / FPS;
const ratePerFrame = (ratePerSecond: number) => ratePerSecond / FPS;

type ElevatorState = 'IDLE' | 'UP' | 'DOWN' | 'LOADING';

interface Person {
	id: number;
	startFloor: number;
	destFloor: number;
	spawnTime: number;
	boardingTime?: number; // Thời điểm lên thang máy
	direction: 'UP' | 'DOWN';
	weight: number; // kg
}

interface Floor {
	level: number;
	upQueue: Person[];
	downQueue: Person[];
	upAssigned: boolean; // Yêu cầu lên đã được gán cho thang máy chưa
	downAssigned: boolean; // Yêu cầu xuống đã được gán cho thang máy chưa
}

class Elevator {
	id: number;
	currentFloor: number;
	state: ElevatorState;
	passengers: Person[];
	internalRequests: Set<number>;
	externalRequests: { floor: number; direction: 'UP' | 'DOWN' }[]; // Yêu cầu được gán từ dispatcher
	timer: number;
	previousState: ElevatorState;  // Lưu state trước đó để biết hướng khi state == "LOADING"
	private readonly floors: Floor[];
	private readonly engine: SimulationEngine;

	constructor(id: number, floors: Floor[], engine: SimulationEngine) {
		this.id = id;
		this.currentFloor = 1;
		this.state = 'IDLE';
		this.previousState = 'IDLE';
		this.passengers = [];
		this.internalRequests = new Set();
		this.externalRequests = [];
		this.timer = 0;
		this.floors = floors;
		this.engine = engine;
	}

	getTotalWeight(): number {
		return this.passengers.reduce((sum, p) => sum + p.weight, 0);
	}

	findNearestRequest(): number | null {
		// Chỉ xử lý các yêu cầu đã được gán cho thang máy này
		if (this.externalRequests.length === 0) return null;

		const currentFloor = Math.round(this.currentFloor);
		let bestScore = Infinity;
		let target: number | null = null;

		this.externalRequests.forEach(req => {
			let score = Infinity;
			const distance = Math.abs(req.floor - currentFloor);
			const isAbove = req.floor > currentFloor;
			const isBelow = req.floor < currentFloor;

			if (this.state === 'UP' || this.previousState === 'UP') {
				if (isAbove && req.direction === 'UP') {
					score = distance;
				}
				else {
					// score = (this.floors.length - req.floor) + (this.floors.length - currentFloor);
					score = 2 * this.floors.length - (req.floor - currentFloor)
				}
			}
			else if (this.state === 'DOWN' || this.previousState === 'DOWN') {
				if (isBelow && req.direction === 'DOWN') {
					score = distance;
				}
				else {
					score = req.floor + currentFloor;
				}
			}
			else {
				score = distance;
			}

			if (score < bestScore) {
				bestScore = score;
				target = req.floor;
			}
		});

		return target;
	}

	shouldStopToPickUpPeople(floor: number): boolean {
		if (this.internalRequests.has(floor)) return true;
		
		// Kiểm tra xem tầng này có trong danh sách yêu cầu được gán không
		const hasExternalRequest = this.externalRequests.some(req => req.floor === floor);
		if (!hasExternalRequest) return false;
		
		const floorIndex = floor - 1;
		const currentWeight = this.getTotalWeight();
		
		// Kiểm tra xem có thể đón ít nhất 1 người không
		if (currentWeight < CONFIG.ELEVATOR_CAPACITY) {
			// Khi đi lên, kiểm tra có người muốn lên VÀ có thể lên được không
			if (this.state === 'UP' && this.floors[floorIndex].upQueue.length > 0) {
				// Kiểm tra người nhẹ nhất trong hàng đợi
				const lightestPerson = this.floors[floorIndex].upQueue.reduce((min, p) => p.weight < min.weight ? p : min);
				if (currentWeight + lightestPerson.weight <= CONFIG.ELEVATOR_CAPACITY) {
					return true;
				}
			}
			// Khi đi xuống, kiểm tra có người muốn xuống VÀ có thể lên được không
			if (this.state === 'DOWN' && this.floors[floorIndex].downQueue.length > 0) {
				const lightestPerson = this.floors[floorIndex].downQueue.reduce((min, p) => p.weight < min.weight ? p : min);
				if (currentWeight + lightestPerson.weight <= CONFIG.ELEVATOR_CAPACITY) {
					return true;
				}
			}
			// Khi IDLE, kiểm tra bất kỳ hàng đợi nào
			if (this.state === 'IDLE') {
				const allPeople = [...this.floors[floorIndex].upQueue, ...this.floors[floorIndex].downQueue];
				if (allPeople.length > 0) {
					const lightestPerson = allPeople.reduce((min, p) => p.weight < min.weight ? p : min);
					if (currentWeight + lightestPerson.weight <= CONFIG.ELEVATOR_CAPACITY) {
						return true;
					}
				}
			}
			// Đặc biệt: Khi ở tầng biên, cho phép đảo chiều
			if (floor === 1 || floor === CONFIG.NUM_FLOORS) {
				const allPeople = [...this.floors[floorIndex].upQueue, ...this.floors[floorIndex].downQueue];
				if (allPeople.length > 0) {
					const lightestPerson = allPeople.reduce((min, p) => p.weight < min.weight ? p : min);
					if (currentWeight + lightestPerson.weight <= CONFIG.ELEVATOR_CAPACITY) {
						return true;
					}
				}
			}
		}
		return false;
	}

	handleBoarding(floor: number) {
		// Trả khách
		const remainingPassengers = [];
		for (const p of this.passengers) {
			if (p.destFloor === floor) {
				// Không cần ghi nhận gì khi trả khách
			} else {
				remainingPassengers.push(p);
			}
		}
		this.passengers = remainingPassengers;
		this.internalRequests.delete(floor);

		// Đón khách - xét hướng dựa trên previousState
		const floorIndex = floor - 1;
		const floorObj = this.floors[floorIndex];
		let pickingUpUp = false;

		// Xử lý đặc biệt cho tầng biên
		if (floor === CONFIG.NUM_FLOORS) {
			// Tầng cao nhất: chỉ có thể đi xuống
			pickingUpUp = false;
		} else if (floor === 1) {
			// Tầng 1: chỉ có thể đi lên
			pickingUpUp = true;
		}
		// Nếu vừa đi lên hoặc đang lên, đón người lên
		else if (this.previousState === 'UP') {
			pickingUpUp = true;
		}
		// Nếu vừa đi xuống hoặc đang xuống, đón người xuống
		else if (this.previousState === 'DOWN') {
			pickingUpUp = false;
		}
		// Nếu IDLE, đón hướng nào đông hơn
		else if (this.previousState === 'IDLE') {
			pickingUpUp = floorObj.upQueue.length >= floorObj.downQueue.length;
		}

		if (pickingUpUp) {
			while (floorObj.upQueue.length > 0 && this.getTotalWeight() < CONFIG.ELEVATOR_CAPACITY) {
				const p = floorObj.upQueue[0]; // Peek first
				// Kiểm tra xem có thể thêm người này không
				if (this.getTotalWeight() + p.weight <= CONFIG.ELEVATOR_CAPACITY) {
					floorObj.upQueue.shift(); // Remove
					p.boardingTime = this.engine.time; // Ghi nhận thời điểm lên thang máy
					// Tính thời gian chờ và lưu vào completedTrips
					this.engine.completedTrips.push(this.engine.time - p.spawnTime);
					this.passengers.push(p);
					this.internalRequests.add(p.destFloor);
				} else {
					break; // Không đủ chỗ cho người tiếp theo
				}
			}
			// Xóa yêu cầu UP khỏi danh sách externalRequests nếu đã đón hết hoặc không còn người
			if (floorObj.upQueue.length === 0) {
				this.externalRequests = this.externalRequests.filter(req => !(req.floor === floor && req.direction === 'UP'));
				floorObj.upAssigned = false;
			}
		} else {
			while (floorObj.downQueue.length > 0 && this.getTotalWeight() < CONFIG.ELEVATOR_CAPACITY) {
				const p = floorObj.downQueue[0]; // Peek first
				// Kiểm tra xem có thể thêm người này không
				if (this.getTotalWeight() + p.weight <= CONFIG.ELEVATOR_CAPACITY) {
					floorObj.downQueue.shift(); // Remove
					p.boardingTime = this.engine.time; // Ghi nhận thời điểm lên thang máy
					// Tính thời gian chờ và lưu vào completedTrips
					this.engine.completedTrips.push(this.engine.time - p.spawnTime);
					this.passengers.push(p);
					this.internalRequests.add(p.destFloor);
				} else {
					break; // Không đủ chỗ cho người tiếp theo
				}
			}
			// Xóa yêu cầu DOWN khỏi danh sách externalRequests nếu đã đón hết hoặc không còn người
			if (floorObj.downQueue.length === 0) {
				this.externalRequests = this.externalRequests.filter(req => !(req.floor === floor && req.direction === 'DOWN'));
				floorObj.downAssigned = false;
			}
		}
	}

	decideNextMove() {
		const currentFloor = Math.round(this.currentFloor);

		// Ưu tiên 1: Nếu có người trong thang, phục vụ họ trước
		if (this.internalRequests.size > 0) {
			if (this.state === 'UP' && Math.max(...Array.from(this.internalRequests)) > currentFloor) {
				this.state = 'UP'; return;
			}
			if (this.state === 'DOWN' && Math.min(...Array.from(this.internalRequests)) < currentFloor) {
				this.state = 'DOWN'; return;
			}
			const nearest = Array.from(this.internalRequests).reduce((prev, curr) =>
				Math.abs(curr - currentFloor) < Math.abs(prev - currentFloor) ? curr : prev
			);
			this.state = nearest > currentFloor ? 'UP' : 'DOWN';
			return;
		}

		// Ưu tiên 2: Tìm yêu cầu từ sảnh chờ
		const target = this.findNearestRequest();
		if (target !== null && target !== currentFloor) {
			if (target > currentFloor) this.state = 'UP';
			else if (target < currentFloor) this.state = 'DOWN';
		} else {
			// Không có việc gì, nghỉ
			this.state = 'IDLE';
		}
	}

	update() {
		const currentFloorInt = Math.round(this.currentFloor);
		const loadingTimeFrames = secondsToFrames(CONFIG.LOADING_TIME);
		const speedPerFrameValue = speedPerFrame(CONFIG.ELEVATOR_SPEED);

		if (this.state === 'LOADING') {
			this.timer++;
			if (this.timer >= loadingTimeFrames) {
				this.handleBoarding(currentFloorInt);
				this.decideNextMove();
			}
			return;
		}

		// Kiểm tra xem có đang gần đến một tầng không
		const distanceToFloor = Math.abs(this.currentFloor - currentFloorInt);
		if (distanceToFloor < speedPerFrameValue / 2) {
			if (this.shouldStopToPickUpPeople(currentFloorInt)) {
				this.currentFloor = currentFloorInt;
				this.previousState = this.state;  // Lưu state trước khi chuyển sang LOADING
				this.state = 'LOADING';
				this.timer = 0;
				return;
			}
		}

		// Lưu tầng trước khi di chuyển (dùng floor để phát hiện khi qua tầng)
		const previousFloor = Math.floor(this.currentFloor);

		if (this.state === 'UP') {
			this.currentFloor += speedPerFrameValue;
			if (this.currentFloor >= CONFIG.NUM_FLOORS) {
				this.currentFloor = CONFIG.NUM_FLOORS;
				// Kiểm tra xem có nên dừng tại tầng cao nhất không
				if (this.shouldStopToPickUpPeople(CONFIG.NUM_FLOORS)) {
					this.previousState = 'UP';
					this.state = 'LOADING';
					this.timer = 0;
				} else {
					// Không có việc gì, chuyển sang IDLE
					this.previousState = 'UP';
					this.state = 'IDLE';
				}
			}

			// Kiểm tra xem có đi qua tầng mới không
			const newFloor = Math.floor(this.currentFloor);
			if (newFloor > previousFloor) {
				// Đã đi qua một tầng mới, cập nhật target nếu cần
				this.decideNextMove();
			}
		} else if (this.state === 'DOWN') {
			this.currentFloor -= speedPerFrameValue;
			if (this.currentFloor <= 1) {
				this.currentFloor = 1;
				// Kiểm tra xem có nên dừng tại tầng 1 không
				if (this.shouldStopToPickUpPeople(1)) {
					this.previousState = 'DOWN';
					this.state = 'LOADING';
					this.timer = 0;
				} else {
					// Không có việc gì, chuyển sang IDLE
					this.previousState = 'DOWN';
					this.state = 'IDLE';
				}
			}

			// Kiểm tra xem có đi qua tầng mới không
			const newFloor = Math.floor(this.currentFloor);
			if (newFloor < previousFloor) {
				// Đã đi qua một tầng mới, cập nhật target nếu cần
				this.decideNextMove();
			}
		} else if (this.state === 'IDLE') {
			this.decideNextMove();
		}
	}
}

interface SimStats {
	avgWaitTimeHistory: { time: number; value: number }[];
	maxWaitTimeHistory: { time: number; value: number }[];
	completedTrips: number[];
	peopleWaitingPerFloor: number[];
	totalActiveTime: number; // Tổng thời gian các thang máy hoạt động (không IDLE)
}

class SimulationEngine {
	floors: Floor[];
	elevators: Elevator[];
	time: number;
	personIdCounter: number;
	completedTrips: number[];
	totalActiveTime: number; // Tổng thời gian các thang máy hoạt động

	constructor(config: Config) {
		this.floors = Array.from({ length: config.NUM_FLOORS }, (_, i) => ({
			level: i + 1,
			upQueue: [],
			downQueue: [],
			upAssigned: false,
			downAssigned: false,
		}));

		this.time = 0;
		this.personIdCounter = 0;
		this.completedTrips = [];
		this.totalActiveTime = 0;

		this.elevators = Array.from({ length: config.NUM_ELEVATORS }, (_, i) =>
			new Elevator(i, this.floors, this)
		);
	}

	reset(config: Config) {
		config = { ...config };
		this.floors = Array.from({ length: config.NUM_FLOORS }, (_, i) => ({
			level: i + 1,
			upQueue: [],
			downQueue: [],
			upAssigned: false,
			downAssigned: false,
		}));
		this.time = 0;
		this.personIdCounter = 0;
		this.completedTrips = [];
		this.totalActiveTime = 0;
		this.elevators = Array.from({ length: config.NUM_ELEVATORS }, (_, i) =>
			new Elevator(i, this.floors, this)
		);
	}

	// Tính điểm số khoảng cách của một thang máy đến một yêu cầu
	calculateElevatorScore(elevator: Elevator, floor: number, direction: 'UP' | 'DOWN'): number {
		const currentFloor = Math.round(elevator.currentFloor);
		const distance = Math.abs(floor - currentFloor);
		const isAbove = floor > currentFloor;
		const isBelow = floor < currentFloor;

		// Sử dụng cùng logic với findNearestRequest
		if (elevator.state === 'UP' || elevator.previousState === 'UP') {
			if (isAbove && direction === 'UP') {
				return distance;
			} else {
				return 2 * this.floors.length + distance;
			}
		} else if (elevator.state === 'DOWN' || elevator.previousState === 'DOWN') {
			if (isBelow && direction === 'DOWN') {
				return distance;
			} else {
				return 2 * this.floors.length + distance;
			}
		} else {
			// IDLE
			return distance;
		}
	}

	// Phân bổ yêu cầu chưa được gán cho thang máy gần nhất
	dispatchRequests() {
		for (const floor of this.floors) {
			// Xử lý yêu cầu UP chưa được gán
			if (floor.upQueue.length > 0 && !floor.upAssigned) {
				let bestElevator: Elevator | undefined = undefined;
				let bestScore = Infinity;

				for (const elevator of this.elevators) {
					const score = this.calculateElevatorScore(elevator, floor.level, 'UP');
					if (score < bestScore) {
						bestScore = score;
						bestElevator = elevator;
					}
				}

				if (bestElevator !== undefined) {
					bestElevator.externalRequests.push({ floor: floor.level, direction: 'UP' });
					floor.upAssigned = true;
				}
			}

			// Xử lý yêu cầu DOWN chưa được gán
			if (floor.downQueue.length > 0 && !floor.downAssigned) {
				let bestElevator: Elevator | undefined = undefined;
				let bestScore = Infinity;

				for (const elevator of this.elevators) {
					const score = this.calculateElevatorScore(elevator, floor.level, 'DOWN');
					if (score < bestScore) {
						bestScore = score;
						bestElevator = elevator;
					}
				}

				if (bestElevator !== undefined) {
					bestElevator.externalRequests.push({ floor: floor.level, direction: 'DOWN' });
					floor.downAssigned = true;
				}
			}
		}
	}

	update() {
		this.time++;

		if (Math.random() < ratePerFrame(CONFIG.PASSENGER_RATE)) {
			const start = Math.floor(Math.random() * CONFIG.NUM_FLOORS) + 1;
			let dest = Math.floor(Math.random() * CONFIG.NUM_FLOORS) + 1;
			while (dest === start) dest = Math.floor(Math.random() * CONFIG.NUM_FLOORS) + 1;

			const person: Person = {
				id: this.personIdCounter++,
				startFloor: start,
				destFloor: dest,
				spawnTime: this.time,
				direction: dest > start ? 'UP' : 'DOWN',
				weight: Math.floor(Math.random() * (CONFIG.MAX_WEIGHT - CONFIG.MIN_WEIGHT + 1)) + CONFIG.MIN_WEIGHT,
			};

			const floorIndex = start - 1;
			if (person.direction === 'UP') this.floors[floorIndex].upQueue.push(person);
			else this.floors[floorIndex].downQueue.push(person);
		}

		// 2. Phân bổ yêu cầu từ sảnh chờ cho thang máy gần nhất
		this.dispatchRequests();

		// 3. Cập nhật thang máy
		this.elevators.forEach(elev => {
			// Tính thời gian hoạt động (không IDLE)
			if (elev.state !== 'IDLE') {
				this.totalActiveTime++;
			}
			elev.update();
		});
	}
}

const LineChart = ({ data, width, height, title }: { data: { time: number; value: number }[], width: number, height: number, title: string }) => {
	const maxVal = Math.max(...data.map(d => d.value), 10);
	const minVal = 0;
	const padding = { left: 50, right: 20, top: 20, bottom: 40 };
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	const points = data.map((d, i) => {
		const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
		const y = padding.top + chartHeight - ((d.value - minVal) / (maxVal - minVal || 1)) * chartHeight;
		return `${x},${y}`;
	}).join(' ');

	// Tạo 5 nhãn trục Y
	const yLabels = [];
	for (let i = 0; i <= 4; i++) {
		const value = maxVal - (i * maxVal / 4);
		const y = padding.top + (i * chartHeight / 4);
		yLabels.push({ value: value.toFixed(1), y });
	}

	// Tạo nhãn trục X (hiển thị thời gian thực tế)
	const xLabels = [];
	const numXLabels = Math.min(10, data.length); // Hiển thị tối đa 10 nhãn
	if (data.length > 0) {
		for (let i = 0; i < numXLabels; i++) {
			const dataIndex = Math.floor((i / (numXLabels - 1 || 1)) * (data.length - 1));
			const x = padding.left + (dataIndex / (data.length - 1 || 1)) * chartWidth;
			const timeInSeconds = data[dataIndex].time;
			xLabels.push({ time: timeInSeconds, x });
		}
	}

	return (
		<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, background: 'white', display: 'flex', flexDirection: 'column' }}>
			<h4 style={{ margin: '0 0 10px 0', fontSize: 14, textAlign: 'center' }}>{title}</h4>
			<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<svg width={width} height={height + 20} style={{ overflow: 'visible' }}>
					{/* Lưới nền */}
					{yLabels.map((label, i) => (
						<g key={i}>
							<line
								x1={padding.left}
								y1={label.y}
								x2={padding.left + chartWidth}
								y2={label.y}
								stroke="#e5e7eb"
								strokeWidth="1"
							/>
							<text
								x={padding.left - 10}
								y={label.y + 4}
								fontSize="10"
								textAnchor="end"
								fill="#6b7280"
							>
								{label.value}s
							</text>
						</g>
					))}

					{/* Trục */}
					<line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartHeight} stroke="#9ca3af" strokeWidth="2" />
					<line x1={padding.left} y1={padding.top + chartHeight} x2={padding.left + chartWidth} y2={padding.top + chartHeight} stroke="#9ca3af" strokeWidth="2" />

					{/* Đường biểu đồ */}
					{data.length > 0 && <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={points} />}

					{/* Nhãn trục X */}
					{xLabels.map((label, i) => (
						<text
							key={i}
							x={label.x}
							y={padding.top + chartHeight + 20}
							fontSize="10"
							textAnchor="middle"
							fill="#6b7280"
						>
							{label.time}s
						</text>
					))}

					{/* Tiêu đề trục X */}
					<text
						x={padding.left + chartWidth / 2}
						y={height + 20}
						fontSize="11"
						textAnchor="middle"
						fill="#374151"
						fontWeight="bold"
					>
						Thời gian (giây)
					</text>
				</svg>
			</div>
		</div>
	);
};

const App = () => {
	const [config, setConfig] = useState<Config>({ ...CONFIG });
	const [isStarted, setIsStarted] = useState(false);
	const [isPaused, setIsPaused] = useState(false);
	const [showConfig, setShowConfig] = useState(false);

	const engineRef = useRef<SimulationEngine | null>(null);

	const [time, setTime] = useState(0);
	const [elevators, setElevators] = useState<Elevator[]>([]);
	const [floors, setFloors] = useState<Floor[]>([]);
	const [stats, setStats] = useState<SimStats>({
		avgWaitTimeHistory: [],
		maxWaitTimeHistory: [],
		completedTrips: [],
		peopleWaitingPerFloor: [],
		totalActiveTime: 0
	});

	const formatTime = (frames: number) => {
		const totalSeconds = Math.floor(frames / 60);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	};

	const handleStart = () => {
		CONFIG = { ...config };
		engineRef.current = new SimulationEngine(config);
		setIsStarted(true);
		setIsPaused(false);
	};

	const handleReset = () => {
		if (engineRef.current) {
			engineRef.current.reset(config);
			setTime(0);
			setStats({
				avgWaitTimeHistory: [],
				maxWaitTimeHistory: [],
				completedTrips: [],
				peopleWaitingPerFloor: [],
				totalActiveTime: 0
			});
		}
	};

	const handleConfigChange = (key: keyof Config, value: number) => {
		setConfig(prev => ({ ...prev, [key]: value }));
	};

	const applyConfigWhileRunning = () => {
		CONFIG = { ...config };
		setShowConfig(false);
	};

	useEffect(() => {
		if (!isStarted || isPaused || !engineRef.current) return;

		let frameId: number;
		let frameCount = 0;
		const loop = () => {
			engineRef.current!.update();
			frameCount++;

			// Force update mỗi frame bằng cách thay đổi reference
			setTime(engineRef.current!.time);
			setElevators([...engineRef.current!.elevators]);
			setFloors([...engineRef.current!.floors]);

			if (engineRef.current!.time % 60 === 0) {
				const engine = engineRef.current!;
				const currentTime = engine.time;
				
				// Thu thập tất cả thời gian chờ (đã hoàn thành)
				const completedWaitTimes = engine.completedTrips;
				
				// Thu thập thời gian chờ hiện tại của những người đang đợi
				const currentWaitTimes: number[] = [];
				engine.floors.forEach(floor => {
					floor.upQueue.forEach(person => {
						currentWaitTimes.push(currentTime - person.spawnTime);
					});
					floor.downQueue.forEach(person => {
						currentWaitTimes.push(currentTime - person.spawnTime);
					});
				});
				
				// Kết hợp cả hai để tính toán
				const allWaitTimes = [...completedWaitTimes, ...currentWaitTimes];
				const avgWait = allWaitTimes.length > 0 ? allWaitTimes.reduce((a, b) => a + b, 0) / allWaitTimes.length / FPS : 0;
				const maxWait = allWaitTimes.length > 0 ? Math.max(...allWaitTimes) / FPS : 0;
				const currentTimeInSeconds = Math.floor(currentTime / FPS);

				setStats(prev => {
					const newAvgHistory = [...prev.avgWaitTimeHistory, { time: currentTimeInSeconds, value: avgWait }];
					const newMaxHistory = [...prev.maxWaitTimeHistory, { time: currentTimeInSeconds, value: maxWait }];
					// Không giới hạn số lượng điểm để luôn hiển thị từ đầu
					return {
						avgWaitTimeHistory: newAvgHistory,
						maxWaitTimeHistory: newMaxHistory,
						completedTrips: completedWaitTimes,
						peopleWaitingPerFloor: engine.floors.map(f => f.upQueue.length + f.downQueue.length),
						totalActiveTime: engine.totalActiveTime
					};
				});
			}
			frameId = requestAnimationFrame(loop);
		};

		frameId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frameId);
	}, [isStarted, isPaused]);

	// GIAO DIỆN CẤU HÌNH BAN ĐẦU
	if (!isStarted) {
		return (
			<div style={{ fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
				<div style={{ background: 'white', padding: 40, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: 500, width: '90%' }}>
					<h1 style={{ margin: '0 0 10px 0', fontSize: 28, textAlign: 'center', color: '#1f2937' }}>Hệ thống Thang máy</h1>
					<p style={{ margin: '0 0 30px 0', textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Cấu hình thông số mô phỏng</p>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Số tầng</label>
							<input type="number" value={config.NUM_FLOORS} onChange={e => handleConfigChange('NUM_FLOORS', parseInt(e.target.value) || 10)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="5" max="20" />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Số thang máy</label>
							<input type="number" value={config.NUM_ELEVATORS} onChange={e => handleConfigChange('NUM_ELEVATORS', parseInt(e.target.value) || 2)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="1" max="4" />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Sức chứa thang máy (kg)</label>
							<input type="number" value={config.ELEVATOR_CAPACITY} onChange={e => handleConfigChange('ELEVATOR_CAPACITY', parseInt(e.target.value) || 600)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="300" max="1500" step="50" />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Khối lượng hành khách (kg): {config.MIN_WEIGHT} - {config.MAX_WEIGHT}</label>
							<div style={{ display: 'flex', gap: 10 }}>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: 12, color: '#6b7280' }}>Tối thiểu</label>
									<input type="number" value={config.MIN_WEIGHT} onChange={e => handleConfigChange('MIN_WEIGHT', parseInt(e.target.value) || 45)}
										style={{ width: '100%', padding: 8, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="30" max="80" step="5" />
								</div>
								<div style={{ flex: 1 }}>
									<label style={{ fontSize: 12, color: '#6b7280' }}>Tối đa</label>
									<input type="number" value={config.MAX_WEIGHT} onChange={e => handleConfigChange('MAX_WEIGHT', parseInt(e.target.value) || 90)}
										style={{ width: '100%', padding: 8, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="60" max="150" step="5" />
								</div>
							</div>
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Tốc độ thang máy (tầng/giây)</label>
							<input type="number" value={config.ELEVATOR_SPEED} onChange={e => handleConfigChange('ELEVATOR_SPEED', parseFloat(e.target.value) || 1)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="0.2" max="5" step="0.2" />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Tỉ lệ xuất hiện hành khách (người/giây)</label>
							<input type="number" value={config.PASSENGER_RATE} onChange={e => handleConfigChange('PASSENGER_RATE', parseFloat(e.target.value) || 0.6)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="0.1" max="5" step="0.1" />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14, color: '#374151' }}>Thời gian mở cửa (giây)</label>
							<input type="number" value={config.LOADING_TIME} onChange={e => handleConfigChange('LOADING_TIME', parseFloat(e.target.value) || 3)}
								style={{ width: '100%', padding: 10, border: '2px solid #e5e7eb', borderRadius: 8, fontSize: 14 }} min="1" max="10" step="0.5" />
						</div>

						<button onClick={handleStart}
							style={{ marginTop: 10, padding: '14px 0', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)' }}>
							Bắt đầu mô phỏng
						</button>
					</div>
				</div>
			</div>
		);
	}

	// GIAO DIỆN CHÍNH KHI ĐANG CHẠY
	return (
		<div style={{ fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f3f4f6' }}>

			{/* HEADER với điều khiển */}
			<div style={{ padding: '15px 25px', background: '#111827', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 10 }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 20 }}>Hệ thống Điều khiển Thang máy</h2>
					<div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Mô phỏng thuật toán lập lịch & Hàng đợi</div>
				</div>

				<div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
					{/* Nút điều khiển */}
					<button onClick={() => setIsPaused(!isPaused)}
						style={{ padding: '8px 20px', background: isPaused ? '#10b981' : '#f59e0b', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
						{isPaused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
					</button>

					<button onClick={handleReset}
						style={{ padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
						🔄 Reset
					</button>

					<button onClick={() => setShowConfig(!showConfig)}
						style={{ padding: '8px 20px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
						⚙ Cấu hình
					</button>

					<div style={{ textAlign: 'right' }}>
						<div style={{ fontSize: 12, color: '#9ca3af' }}>Đã phục vụ</div>
						<div style={{ fontSize: 24, fontWeight: 'bold', color: '#10b981' }}>{stats.completedTrips.length} <span style={{ fontSize: 14 }}>người</span></div>
					</div>

					<div style={{ textAlign: 'right' }}>
						<div style={{ fontSize: 12, color: '#9ca3af' }}>Hiệu suất</div>
						<div style={{ fontSize: 24, fontWeight: 'bold', color: '#3b82f6' }}>
							{(() => {
								const totalPossibleTime = time * config.NUM_ELEVATORS;
								const efficiency = totalPossibleTime > 0 ? (stats.totalActiveTime / totalPossibleTime * 100) : 0;
								return efficiency.toFixed(1);
							})()}
							<span style={{ fontSize: 14 }}>%</span>
						</div>
					</div>

					<div style={{ background: '#374151', padding: '5px 15px', borderRadius: 6, textAlign: 'center', border: '1px solid #4b5563' }}>
						<div style={{ fontSize: 10, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: 1 }}>Thời gian</div>
						<div style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: 'bold', color: '#fbbf24' }}>
							{formatTime(time)}
						</div>
					</div>
				</div>
			</div>

			{/* PANEL CẤU HÌNH (nếu mở) */}
			{showConfig && (
				<div style={{ position: 'absolute', top: 80, right: 25, background: 'white', padding: 20, borderRadius: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', zIndex: 100, width: 350 }}>
					<h3 style={{ margin: '0 0 15px 0', fontSize: 18 }}>Điều chỉnh cấu hình</h3>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 15, maxHeight: 400, overflowY: 'auto' }}>
						<div>
							<label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 600 }}>Tốc độ thang máy: {config.ELEVATOR_SPEED.toFixed(1)} tầng/giây</label>
							<input type="range" value={config.ELEVATOR_SPEED} onChange={e => handleConfigChange('ELEVATOR_SPEED', parseFloat(e.target.value))}
								min="0.2" max="5" step="0.2" style={{ width: '100%' }} />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 600 }}>Tỉ lệ spawn hành khách: {config.PASSENGER_RATE.toFixed(1)} người/giây</label>
							<input type="range" value={config.PASSENGER_RATE} onChange={e => handleConfigChange('PASSENGER_RATE', parseFloat(e.target.value))}
								min="0.1" max="5" step="0.1" style={{ width: '100%' }} />
						</div>

						<div>
							<label style={{ display: 'block', marginBottom: 5, fontSize: 13, fontWeight: 600 }}>Thời gian mở cửa: {config.LOADING_TIME.toFixed(1)} giây</label>
							<input type="range" value={config.LOADING_TIME} onChange={e => handleConfigChange('LOADING_TIME', parseFloat(e.target.value))}
								min="1" max="10" step="0.5" style={{ width: '100%' }} />
						</div>

						<button onClick={applyConfigWhileRunning}
							style={{ marginTop: 10, padding: 10, background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
							Áp dụng
						</button>
					</div>
				</div>
			)}

			{/* VIEW MÔ PHỎNG */}
			<div style={{ flex: '3', position: 'relative', background: 'white', margin: 15, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
				{/* Lưới nền */}
				{floors.map((floor) => (
					<div key={floor.level} style={{
						position: 'absolute',
						bottom: `${(floor.level - 1) * (100 / config.NUM_FLOORS)}%`,
						height: `${100 / config.NUM_FLOORS}%`,
						width: '100%',
						borderTop: '2px solid #cbd5e1',
						boxSizing: 'border-box',
						display: 'flex',
						alignItems: 'center',
						background: floor.level % 2 === 0 ? '#fafafa' : 'white'
					}}>
						{/* Số tầng bên trái */}
						<div style={{ width: 60, textAlign: 'center', color: '#64748b', fontWeight: 'bold', fontSize: 14, background: 'white', padding: '4px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>Tầng {floor.level}</div>

						{/* HUY HIỆU SỐ NGƯỜI CHỜ (Thay cho icon mũi tên) */}
						<div style={{ marginLeft: 20, display: 'flex', gap: 10 }}>
							{floor.upQueue.length > 0 && (
								<div style={{
									background: '#ecfdf5', border: '1px solid #10b981', color: '#047857',
									padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 'bold',
									display: 'flex', alignItems: 'center', gap: 5
								}}>
									<span>▲</span> {floor.upQueue.length}
								</div>
							)}

							{floor.downQueue.length > 0 && (
								<div style={{
									background: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c',
									padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 'bold',
									display: 'flex', alignItems: 'center', gap: 5
								}}>
									<span>▼</span> {floor.downQueue.length}
								</div>
							)}
						</div>
					</div>
				))}

				{/* Khu vực thang máy */}
				<div style={{ position: 'absolute', right: 50, height: '100%', width: `${config.NUM_ELEVATORS * 80 + (config.NUM_ELEVATORS - 1) * 20}px`, display: 'flex', gap: 20 }}>
					{elevators.map((elev, _) => (
						<div key={elev.id} style={{ width: 80, height: '100%', position: 'relative' }}>
							{/* Đường kẻ ngang tại mỗi tầng */}
							{floors.map(f => (
								<div key={`line-${f.level}`} style={{
									position: 'absolute',
									bottom: `${(f.level - 1) * (100 / config.NUM_FLOORS)}%`,
									width: '100%',
									height: '2px',
									background: '#cbd5e1',
									zIndex: 1
								}} />
							))}

							{/* Dây cáp */}
							<div style={{ position: 'absolute', left: '50%', width: 2, height: '100%', background: '#94a3b8', transform: 'translateX(-50%)', zIndex: 2 }}></div>

							{/* Cabin thang máy */}
							<div style={{
								position: 'absolute',
								bottom: `${((elev.currentFloor - 1) / (config.NUM_FLOORS - 1)) * (100 - 100 / config.NUM_FLOORS)}%`,
								width: '100%',
								height: `${100 / config.NUM_FLOORS}%`,
								background: elev.state === 'IDLE' ? '#10b981' : (elev.getTotalWeight() >= config.ELEVATOR_CAPACITY ? '#ef4444' : '#3b82f6'),
								border: '3px solid #1f2937',
								borderRadius: 6,
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								color: 'white',
								transition: 'background 0.3s ease',
								willChange: 'bottom',
								transform: 'translateZ(0)',
								zIndex: 10,
								boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
							}}>
								<div style={{ fontWeight: 'bold', fontSize: 16 }}>Tầng {Math.round(elev.currentFloor)}</div>
								<div style={{ fontSize: 11, opacity: 0.9 }}>{elev.getTotalWeight()}kg / {config.ELEVATOR_CAPACITY}kg</div>
								<div style={{ fontSize: 10, opacity: 0.8 }}>({elev.passengers.length} người)</div>

								{/* Chỉ hướng đi của thang */}
								{(elev.state === 'UP' || elev.state === 'DOWN') && (
									<div style={{ position: 'absolute', right: -25, color: '#3b82f6', fontWeight: 'bold' }}>
										{elev.state === 'UP' ? '▲' : '▼'}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

		{/* BIỂU ĐỒ */}
		<div style={{ flex: '2', display: 'flex', flexDirection: 'column', gap: 15, padding: '0 15px 15px' }}>
			<div style={{ width: '100%' }}>
				<LineChart data={stats.avgWaitTimeHistory} width={800} height={150} title="Thời gian chờ trung bình" />
			</div>
			<div style={{ width: '100%' }}>
				<LineChart data={stats.maxWaitTimeHistory} width={800} height={150} title="Thời gian chờ tối đa" />
			</div>
		</div>
		</div>
	);
};

export default App;
