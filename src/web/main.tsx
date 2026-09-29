import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./styles.css";
import { AppShell } from "./components/AppShell.tsx";
import { RegSheetProvider } from "./components/RegSheet.tsx";
import { TooltipProvider, Spinner } from "./components/ui/index.tsx";
import { OverviewPage } from "./pages/Overview.tsx";
import { CasesPage } from "./pages/Cases.tsx";
import { CasePage } from "./pages/Case.tsx";
import { NewCasePage } from "./pages/NewCase.tsx";
import { ScreeningPage } from "./pages/Screening.tsx";
import { ClassifyPage } from "./pages/Classify.tsx";
import { AskPage } from "./pages/Ask.tsx";
import { CclPage, EccnPage } from "./pages/Ccl.tsx";
import { ChartPage } from "./pages/Chart.tsx";
import { CountriesPage, CountryPage } from "./pages/Countries.tsx";
import { JapanPage } from "./pages/Japan.tsx";
import { LibraryPage } from "./pages/Library.tsx";
import { UpdatesPage } from "./pages/Updates.tsx";
import { ProductsPage } from "./pages/Products.tsx";
import { AuditPage } from "./pages/Audit.tsx";
import { SettingsPage } from "./pages/Settings.tsx";
import { IntelligencePage } from "./pages/Intelligence.tsx";
import { ExposurePage } from "./pages/Exposure.tsx";

const ReportPage = lazy(() => import("./pages/Report.tsx").then((m) => ({ default: m.ReportPage })));

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

const router = createBrowserRouter([
  {
    path: "/cases/:id/report",
    element: (
      <Suspense fallback={<Spinner />}>
        <ReportPage />
      </Suspense>
    ),
  },
  {
    element: (
      <RegSheetProvider>
        <AppShell />
      </RegSheetProvider>
    ),
    children: [
      { path: "/", element: <OverviewPage /> },
      { path: "/cases", element: <CasesPage /> },
      { path: "/cases/new", element: <NewCasePage /> },
      { path: "/cases/:id", element: <CasePage /> },
      { path: "/screening", element: <ScreeningPage /> },
      { path: "/classify", element: <ClassifyPage /> },
      { path: "/ask", element: <AskPage /> },
      { path: "/regulations/ccl", element: <CclPage /> },
      { path: "/regulations/ccl/:id", element: <EccnPage /> },
      { path: "/regulations/chart", element: <ChartPage /> },
      { path: "/regulations/countries", element: <CountriesPage /> },
      { path: "/regulations/countries/:iso", element: <CountryPage /> },
      { path: "/regulations/japan", element: <JapanPage /> },
      { path: "/regulations/library", element: <LibraryPage /> },
      { path: "/regulations/updates", element: <UpdatesPage /> },
      { path: "/products", element: <ProductsPage /> },
      { path: "/audit", element: <AuditPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/intelligence", element: <IntelligencePage /> },
      { path: "/exposure", element: <ExposurePage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
