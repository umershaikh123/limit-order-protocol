"use client";

interface NavigationProps {
    activeOrder: "stop-loss" | "iceberg" | "oco";
    setActiveOrder: (order: "stop-loss" | "iceberg" | "oco") => void;
}

export function Navigation({ activeOrder, setActiveOrder }: NavigationProps) {
    const orderTypes = [
        {
            id: "stop-loss" as const,
            name: "Stop Loss",
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                    />
                </svg>
            ),
            color: "blue",
            description: "Automated risk management",
        },
        {
            id: "iceberg" as const,
            name: "Iceberg",
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m/0 0l4-4m-4 4l-4-4"
                    />
                </svg>
            ),
            color: "purple",
            description: "Progressive order revelation",
        },
        {
            id: "oco" as const,
            name: "OCO",
            icon: (
                <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                </svg>
            ),
            color: "pink",
            description: "One cancels other",
        },
    ];

    const getColorClasses = (color: string, isActive: boolean) => {
        const colors = {
            blue: {
                active: "bg-blue-500/20 border-blue-500/50 text-blue-300",
                inactive:
                    "border-gray-700 text-gray-400 hover:border-blue-500/30 hover:text-blue-400",
            },
            purple: {
                active: "bg-purple-500/20 border-purple-500/50 text-purple-300",
                inactive:
                    "border-gray-700 text-gray-400 hover:border-purple-500/30 hover:text-purple-400",
            },
            pink: {
                active: "bg-pink-500/20 border-pink-500/50 text-pink-300",
                inactive:
                    "border-gray-700 text-gray-400 hover:border-pink-500/30 hover:text-pink-400",
            },
        };
        return colors[color as keyof typeof colors][
            isActive ? "active" : "inactive"
        ];
    };

    return (
        <div className="flex justify-center">
            <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-2 inline-flex">
                {orderTypes.map((order) => {
                    const isActive = activeOrder === order.id;
                    return (
                        <button
                            key={order.id}
                            onClick={() => setActiveOrder(order.id)}
                            className={`
                relative flex items-center space-x-3 px-6 py-3 rounded-lg border transition-all duration-200
                ${getColorClasses(order.color, isActive)}
              `}
                        >
                            <div className="flex items-center space-x-2">
                                {order.icon}
                                <span className="font-medium">
                                    {order.name}
                                </span>
                            </div>
                            <div className="text-xs opacity-75">
                                {order.description}
                            </div>

                            {isActive && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse rounded-lg" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
