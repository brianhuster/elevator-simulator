import React, { useState, useEffect, useRef } from 'react';

// --- 1. CẤU HÌNH HỆ THỐNG ---
const CONFIG = {
	NUM_FLOORS: 10,
	NUM_ELEVATORS: 2,
	ELEVATOR_CAPACITY: 8,
	PASSENGER_RATE: 0.03, // Tăng nhẹ để nhanh có người test
	FLOOR_HEIGHT_PX: 50,
	ELEVATOR_SPEED: 0.05,
	LOADING_TIME: 60,
};

// --- 2. ĐỊNH NGHĨA KIỂU DỮ LIỆU ---
type ElevatorState = 'IDLE' | 'MOVING_UP' | 'MOVING_DOWN' | 'LOADING';

interface Person {
	id: number;
	startFloor: number;
	destFloor: number;
	spawnTime: number;
	direction: 'UP' | 'DOWN';
}

interface Floor {
	level: number;
	upQueue: Person[];
	downQueue: Person[];
}

interface Elevator {
	id: number;
	currentFloor: number;
	targetFloor: number | null;
	state: ElevatorState;
	passengers: Person[];
	internalRequests: Set<number>;
	timer: number;
}

interface SimStats {
	avgWaitTimeHistory: number[];
	completedTrips: number[];
	peopleWaitingPerFloor: number[];
}

class SimulationEngine {
	floors: Floor[];
	elevators: Elevator[];
	time: number;
	personIdCounter: number;
	completedTrips: number[];

	constructor() {
		this.floors = Array.from({ length: CONFIG.NUM_FLOORS }, (_, i) => ({
			level: i,
			upQueue: [],
			downQueue: [],
		}));

		this.elevators = Array.from({ length: CONFIG.NUM_ELEVATORS }, (_, i) => ({
			id: i,
			currentFloor: 0,
			targetFloor: null,
			state: 'IDLE',
			passengers: [],
			internalRequests: new Set(),
			timer: 0,
		}));

		this.time = 0;
		this.personIdCounter = 0;
		this.completedTrips = [];
	}

	// --- Helper Logic ---
	findNearestRequest(currentFloor: number): number | null {
		let minDist = Infinity;
		let target = null;
		this.floors.forEach(f => {
			if (f.upQueue.length > 0 || f.downQueue.length > 0) {
				const dist = Math.abs(f.level - currentFloor);
				if (dist < minDist) {
					minDist = dist;
					target = f.level;
				}
			}
		});
		return target;
	}

	// --- Main Update Loop ---
	update() {
		this.time++;

		// 1. Sinh người
		if (Math.random() < CONFIG.PASSENGER_RATE) {
			const start = Math.floor(Math.random() * CONFIG.NUM_FLOORS);
			let dest = Math.floor(Math.random() * CONFIG.NUM_FLOORS);
			while (dest === start) dest = Math.floor(Math.random() * CONFIG.NUM_FLOORS);

			const person: Person = {
				id: this.personIdCounter++,
				startFloor: start,
				destFloor: dest,
				spawnTime: this.time,
				direction: dest > start ? 'UP' : 'DOWN',
			};

			if (person.direction === 'UP') this.floors[start].upQueue.push(person);
			else this.floors[start].downQueue.push(person);
		}

		// 2. Cập nhật thang máy
		this.elevators.forEach(elev => this.updateElevator(elev));
	}

	updateElevator(elev: Elevator) {
		const currentFloorInt = Math.round(elev.currentFloor);

		if (elev.state === 'LOADING') {
			elev.timer++;
			if (elev.timer >= CONFIG.LOADING_TIME) {
				this.handleBoarding(elev, currentFloorInt);
				this.decideNextMove(elev, currentFloorInt);
			}
			return;
		}

		const distanceToFloor = Math.abs(elev.currentFloor - currentFloorInt);
		if (distanceToFloor < CONFIG.ELEVATOR_SPEED / 2) {
			if (this.shouldStop(elev, currentFloorInt)) {
				elev.currentFloor = currentFloorInt;
				elev.state = 'LOADING';
				elev.timer = 0;
				return;
			}
		}

		if (elev.state === 'MOVING_UP') {
			elev.currentFloor += CONFIG.ELEVATOR_SPEED;
			if (elev.currentFloor >= CONFIG.NUM_FLOORS - 1) {
				elev.currentFloor = CONFIG.NUM_FLOORS - 1;
				elev.state = 'LOADING';
			}
		} else if (elev.state === 'MOVING_DOWN') {
			elev.currentFloor -= CONFIG.ELEVATOR_SPEED;
			if (elev.currentFloor <= 0) {
				elev.currentFloor = 0;
				elev.state = 'LOADING';
			}
		} else if (elev.state === 'IDLE') {
			this.decideNextMove(elev, currentFloorInt);
		}
	}

	shouldStop(elev: Elevator, floor: number): boolean {
		if (elev.internalRequests.has(floor)) return true;
		if (elev.passengers.length < CONFIG.ELEVATOR_CAPACITY) {
			if (elev.state === 'MOVING_UP' && this.floors[floor].upQueue.length > 0) return true;
			if (elev.state === 'MOVING_DOWN' && this.floors[floor].downQueue.length > 0) return true;
			if (elev.state === 'IDLE' && (this.floors[floor].upQueue.length > 0 || this.floors[floor].downQueue.length > 0)) return true;
		}
		return false;
	}

	handleBoarding(elev: Elevator, floor: number) {
		// Trả khách
		const remainingPassengers = [];
		for (const p of elev.passengers) {
			if (p.destFloor === floor) {
				this.completedTrips.push(this.time - p.spawnTime);
			} else {
				remainingPassengers.push(p);
			}
		}
		elev.passengers = remainingPassengers;
		elev.internalRequests.delete(floor);

		// Đón khách
		const floorObj = this.floors[floor];
		let pickingUpUp = false;
		if (elev.state === 'MOVING_UP' || (elev.state === 'IDLE' && floorObj.upQueue.length >= floorObj.downQueue.length)) {
			pickingUpUp = true;
		}

		if (pickingUpUp) {
			while (floorObj.upQueue.length > 0 && elev.passengers.length < CONFIG.ELEVATOR_CAPACITY) {
				const p = floorObj.upQueue.shift();
				if (p) { elev.passengers.push(p); elev.internalRequests.add(p.destFloor); }
			}
		} else {
			while (floorObj.downQueue.length > 0 && elev.passengers.length < CONFIG.ELEVATOR_CAPACITY) {
				const p = floorObj.downQueue.shift();
				if (p) { elev.passengers.push(p); elev.internalRequests.add(p.destFloor); }
			}
		}
	}

	decideNextMove(elev: Elevator, currentFloor: number) {
		if (elev.internalRequests.size > 0) {
			if (elev.state === 'MOVING_UP' && Math.max(...Array.from(elev.internalRequests)) > currentFloor) {
				elev.state = 'MOVING_UP'; return;
			}
			if (elev.state === 'MOVING_DOWN' && Math.min(...Array.from(elev.internalRequests)) < currentFloor) {
				elev.state = 'MOVING_DOWN'; return;
			}
			const nearest = Array.from(elev.internalRequests).reduce((prev, curr) =>
				Math.abs(curr - currentFloor) < Math.abs(prev - currentFloor) ? curr : prev
			);
			elev.state = nearest > currentFloor ? 'MOVING_UP' : 'MOVING_DOWN';
			return;
		}

		const target = this.findNearestRequest(currentFloor);
		if (target !== null) {
			if (target > currentFloor) elev.state = 'MOVING_UP';
			else if (target < currentFloor) elev.state = 'MOVING_DOWN';
			else elev.state = 'LOADING';
		} else {
			elev.state = 'IDLE';
		}
	}
}

const LineChart = ({ data, width, height, title }: { data: number[], width: number, height: number, title: string }) => {
	const maxVal = Math.max(...data, 10);
	const points = data.map((val, i) => {
		const x = (i / (data.length - 1 || 1)) * width;
		const y = height - (val / maxVal) * height;
		return `${x},${y}`;
	}).join(' ');

	return (
		<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, background: 'white', display: 'flex', flexDirection: 'column' }}>
			<h4 style={{ margin: '0 0 10px 0', fontSize: 14, textAlign: 'center' }}>{title}</h4>
			<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<svg width={width} height={height} style={{ overflow: 'visible' }}>
					{/* Grid lines */}
					<line x1="0" y1="0" x2="0" y2={height} stroke="#eee" />
					<line x1="0" y1={height} x2={width} y2={height} stroke="#eee" />
					<polyline fill="none" stroke="#2563eb" strokeWidth="2" points={points} />
				</svg>
			</div>
			<div style={{ fontSize: 10, color: 'gray', marginTop: 5, textAlign: 'center' }}>Thời gian thực</div>
		</div>
	);
};

const BarChart = ({ data, width, height, title }: { data: number[], width: number, height: number, title: string }) => {
	const maxVal = Math.max(...data, 5);
	const barWidth = (width / data.length) - 5;

	return (
		<div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, background: 'white', display: 'flex', flexDirection: 'column' }}>
			<h4 style={{ margin: '0 0 10px 0', fontSize: 14, textAlign: 'center' }}>{title}</h4>
			<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
				<svg width={width} height={height} style={{ overflow: 'visible' }}>
					{data.map((val, i) => (
						<g key={i}>
							<rect
								x={i * (width / data.length)}
								y={height - (val / maxVal) * height}
								width={barWidth}
								height={(val / maxVal) * height}
								fill={val > 0 ? "#f97316" : "#eee"}
							/>
							<text x={i * (width / data.length) + barWidth / 2} y={height + 12} fontSize="10" textAnchor="middle" fill="gray">{i}</text>
							{val > 0 && <text x={i * (width / data.length) + barWidth / 2} y={height - (val / maxVal) * height - 5} fontSize="10" textAnchor="middle" fill="black">{val}</text>}
						</g>
					))}
				</svg>
			</div>
			<div style={{ fontSize: 10, color: 'gray', marginTop: 5, textAlign: 'center' }}>Số người chờ từng tầng</div>
		</div>
	);
};

const App = () => {
	const engineRef = useRef(new SimulationEngine());

	const [time, setTime] = useState(0); // State thời gian
	const [elevators, setElevators] = useState<Elevator[]>([]);
	const [floors, setFloors] = useState<Floor[]>([]);
	const [stats, setStats] = useState<SimStats>({
		avgWaitTimeHistory: [],
		completedTrips: [],
		peopleWaitingPerFloor: []
	});

	// Helper format thời gian MM:SS
	const formatTime = (frames: number) => {
		const totalSeconds = Math.floor(frames / 60); // Giả sử 60fps = 1s
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	};

	useEffect(() => {
		let frameId: number;
		const loop = () => {
			engineRef.current.update();

			setTime(engineRef.current.time);
			setElevators([...engineRef.current.elevators.map(e => ({ ...e }))]);
			setFloors([...engineRef.current.floors]);

			if (engineRef.current.time % 60 === 0) {
				const trips = engineRef.current.completedTrips;
				const avgWait = trips.length > 0 ? trips.reduce((a, b) => a + b, 0) / trips.length : 0;

				setStats(prev => {
					const newHistory = [...prev.avgWaitTimeHistory, avgWait];
					if (newHistory.length > 50) newHistory.shift();
					return {
						avgWaitTimeHistory: newHistory,
						completedTrips: trips,
						peopleWaitingPerFloor: engineRef.current.floors.map(f => f.upQueue.length + f.downQueue.length)
					};
				});
			}
			frameId = requestAnimationFrame(loop);
		};

		frameId = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frameId);
	}, []);

	return (
		<div style={{ fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#f3f4f6' }}>

			{/* HEADER: Có Đồng hồ */}
			<div style={{ padding: '15px 25px', background: '#111827', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 10 }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 20 }}>Hệ thống Điều khiển Thang máy</h2>
					<div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Mô phỏng thuật toán lập lịch & Hàng đợi</div>
				</div>

				<div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
					<div style={{ textAlign: 'right' }}>
						<div style={{ fontSize: 12, color: '#9ca3af' }}>Đã phục vụ</div>
						<div style={{ fontSize: 24, fontWeight: 'bold', color: '#10b981' }}>{stats.completedTrips.length} <span style={{ fontSize: 14 }}>người</span></div>
					</div>

					{/* ĐỒNG HỒ */}
					<div style={{ background: '#374151', padding: '5px 15px', borderRadius: 6, textAlign: 'center', border: '1px solid #4b5563' }}>
						<div style={{ fontSize: 10, color: '#d1d5db', textTransform: 'uppercase', letterSpacing: 1 }}>Thời gian</div>
						<div style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: 'bold', color: '#fbbf24' }}>
							{formatTime(time)}
						</div>
					</div>
				</div>
			</div>

			{/* VIEW MÔ PHỎNG */}
			<div style={{ flex: '3', position: 'relative', background: 'white', margin: 15, borderRadius: 12, boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
				{/* Lưới nền */}
				{floors.map((floor) => (
					<div key={floor.level} style={{
						position: 'absolute',
						bottom: floor.level * 10 + '%',
						height: '10%',
						width: '100%',
						borderTop: '1px solid #f3f4f6',
						boxSizing: 'border-box',
						display: 'flex',
						alignItems: 'center'
					}}>
						{/* Số tầng bên trái */}
						<div style={{ width: 60, textAlign: 'center', color: '#9ca3af', fontWeight: 'bold', fontSize: 14 }}>Tầng {floor.level}</div>

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
				<div style={{ position: 'absolute', right: 50, height: '100%', width: 250, display: 'flex', justifyContent: 'space-between' }}>
					{elevators.map((elev, idx) => (
						<div key={elev.id} style={{ width: 80, height: '100%', position: 'relative', background: '#f9fafb', borderLeft: '1px dashed #e5e7eb', borderRight: '1px dashed #e5e7eb' }}>
							{/* Dây cáp */}
							<div style={{ position: 'absolute', left: '50%', width: 2, height: '100%', background: '#d1d5db', transform: 'translateX(-50%)' }}></div>

							{/* Cabin thang máy */}
							<div style={{
								position: 'absolute',
								bottom: `${(elev.currentFloor / (CONFIG.NUM_FLOORS - 1)) * 90}%`,
								width: '100%',
								height: '10%',
								background: elev.state === 'IDLE' ? '#10b981' : (elev.passengers.length >= CONFIG.ELEVATOR_CAPACITY ? '#ef4444' : '#3b82f6'),
								border: '3px solid #1f2937',
								borderRadius: 6,
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								color: 'white',
								transition: 'bottom 0.1s linear',
								zIndex: 10,
								boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
							}}>
								<div style={{ fontWeight: 'bold', fontSize: 16 }}>{Math.round(elev.currentFloor)}</div>
								<div style={{ fontSize: 11, opacity: 0.9 }}>Khách: {elev.passengers.length}</div>

								{/* Chỉ hướng đi của thang */}
								{(elev.state === 'MOVING_UP' || elev.state === 'MOVING_DOWN') && (
									<div style={{ position: 'absolute', right: -25, color: '#3b82f6', fontWeight: 'bold' }}>
										{elev.state === 'MOVING_UP' ? '▲' : '▼'}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* BIỂU ĐỒ */}
			<div style={{ flex: '2', display: 'flex', gap: 20, padding: '0 15px 15px' }}>
				<div style={{ flex: 1 }}>
					<LineChart data={stats.avgWaitTimeHistory} width={400} height={120} title="Thời gian chờ trung bình (giây)" />
				</div>
				<div style={{ flex: 1 }}>
					<BarChart data={stats.peopleWaitingPerFloor} width={400} height={120} title="Số người chờ tại mỗi tầng" />
				</div>
			</div>
		</div>
	);
};

export default App;
