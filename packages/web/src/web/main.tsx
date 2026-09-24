import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import App from "./app.tsx";
import { applyTheme, getTheme } from "./lib/store";

// Apply saved theme on startup
applyTheme(getTheme());

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 0,
			refetchOnWindowFocus: true,
			refetchOnReconnect: true,
			retry: 2,
			retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000),
		},
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<Router>
				<App />
			</Router>
		</QueryClientProvider>
	</StrictMode>,
);
