import { lazy, useState, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/modules/auth/AuthProvider";
import { ChangePasswordPage } from "@/modules/auth/ChangePasswordPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { PinPage } from "@/modules/auth/PinPage";
import { CustomerPage } from "@/modules/credit/CustomerPage";
import { CustomersPage } from "@/modules/credit/CustomersPage";
import { BatchPage } from "@/modules/inventory/BatchPage";
import { CloseBatchPage } from "@/modules/inventory/CloseBatchPage";
import { StockPage } from "@/modules/inventory/StockPage";
import { TransferPage } from "@/modules/inventory/TransferPage";
import { TransfersPage } from "@/modules/inventory/TransfersPage";
import { NotificationsPage } from "@/modules/notifications/NotificationsPage";
import { SaleCardPage } from "@/modules/sales/SaleCardPage";
import { SalePage } from "@/modules/sales/SalePage";
import { SalesPage } from "@/modules/sales/SalesPage";
import { PageLoader } from "@/shared/ui/feedback";
import { AppShell } from "./AppShell";

/**
 * Sotuvchi planshetiga faqat o'z sahifalari yuklanadi: ega va omborchi bo'limlari (hisobotlar, katalog, kirim,
 * tuzilma, sozlamalar, platforma) — alohida bo'laklar, birinchi ochilganda yuklanadi. Shell'lar ichidagi
 * Suspense bo'lak kelguncha yuklanish belgisini ko'rsatadi.
 */
const DevicesPage = lazy(() => import("@/modules/auth/DevicesPage").then((m) => ({ default: m.DevicesPage })));
const ProfilePage = lazy(() => import("@/modules/auth/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const AttributesPage = lazy(() => import("@/modules/catalog/AttributesPage").then((m) => ({ default: m.AttributesPage })));
const CatalogLayout = lazy(() => import("@/modules/catalog/CatalogLayout").then((m) => ({ default: m.CatalogLayout })));
const FabricsPage = lazy(() => import("@/modules/catalog/FabricsPage").then((m) => ({ default: m.FabricsPage })));
const SkuPage = lazy(() => import("@/modules/catalog/SkuPage").then((m) => ({ default: m.SkuPage })));
const SkusPage = lazy(() => import("@/modules/catalog/SkusPage").then((m) => ({ default: m.SkusPage })));
const JournalPage = lazy(() => import("@/modules/core/JournalPage").then((m) => ({ default: m.JournalPage })));
const SettingsLayout = lazy(() => import("@/modules/core/SettingsLayout").then((m) => ({ default: m.SettingsLayout })));
const SettingsPage = lazy(() => import("@/modules/core/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const DifferencesPage = lazy(() => import("@/modules/inventory/DifferencesPage").then((m) => ({ default: m.DifferencesPage })));
const TransferCreatePage = lazy(() => import("@/modules/inventory/TransferCreatePage").then((m) => ({ default: m.TransferCreatePage })));
const BusinessCreatePage = lazy(() => import("@/modules/platform/BusinessCreatePage").then((m) => ({ default: m.BusinessCreatePage })));
const SecurityPage = lazy(() => import("@/modules/platform/SecurityPage").then((m) => ({ default: m.SecurityPage })));
const BusinessesPage = lazy(() => import("@/modules/platform/BusinessesPage").then((m) => ({ default: m.BusinessesPage })));
const BusinessPage = lazy(() => import("@/modules/platform/BusinessPage").then((m) => ({ default: m.BusinessPage })));
const ReceiptCreatePage = lazy(() => import("@/modules/receiving/ReceiptCreatePage").then((m) => ({ default: m.ReceiptCreatePage })));
const ReceiptPage = lazy(() => import("@/modules/receiving/ReceiptPage").then((m) => ({ default: m.ReceiptPage })));
const ReceiptsPage = lazy(() => import("@/modules/receiving/ReceiptsPage").then((m) => ({ default: m.ReceiptsPage })));
const CreditReportPage = lazy(() => import("@/modules/reports/CreditReportPage").then((m) => ({ default: m.CreditReportPage })));
const Dashboard = lazy(() => import("@/modules/reports/Dashboard").then((m) => ({ default: m.Dashboard })));
const DeviationReportPage = lazy(() => import("@/modules/reports/DeviationReportPage").then((m) => ({ default: m.DeviationReportPage })));
const HoursReportPage = lazy(() => import("@/modules/reports/HoursReportPage").then((m) => ({ default: m.HoursReportPage })));
const ReportsLayout = lazy(() => import("@/modules/reports/ReportsLayout").then((m) => ({ default: m.ReportsLayout })));
const SalesReportPage = lazy(() => import("@/modules/reports/SalesReportPage").then((m) => ({ default: m.SalesReportPage })));
const StockReportPage = lazy(() => import("@/modules/reports/StockReportPage").then((m) => ({ default: m.StockReportPage })));
const TopReportPage = lazy(() => import("@/modules/reports/TopReportPage").then((m) => ({ default: m.TopReportPage })));
const LocationsPage = lazy(() => import("@/modules/structure/LocationsPage").then((m) => ({ default: m.LocationsPage })));
const StaffPage = lazy(() => import("@/modules/structure/StaffPage").then((m) => ({ default: m.StaffPage })));
const StructureLayout = lazy(() => import("@/modules/structure/StructureLayout").then((m) => ({ default: m.StructureLayout })));
import { StoreShell } from "./StoreShell";

/**
 * Kirgan foydalanuvchi uchun qobiq:
 * vaqtinchalik parolli — avval parolni almashtiradi; sotuvchi — do'kon qurilmasi qobig'i; qolganlar — asosiy qobiq.
 */
function Protected() {
  const { status, user } = useAuth();
  if (status === "loading") return <PageLoader />;
  if (status === "guest" || !user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <ChangePasswordPage />;
  return user.role === "seller" ? <StoreShell /> : <AppShell />;
}

/** Kirmagan foydalanuvchi: do'kon qurilmasida — PIN ekrani, boshqa joyda — telefon va parol. */
function GuestOnly() {
  const { status, device } = useAuth();
  const [usePassword, setUsePassword] = useState(false);
  if (status === "loading") return <PageLoader />;
  if (status === "authed") return <Navigate to="/" replace />;
  if (device?.bound && !usePassword) {
    return <PinPage device={device} onUsePassword={() => setUsePassword(true)} />;
  }
  return (
    <LoginPage
      onBackToPin={device?.bound ? () => setUsePassword(false) : undefined}
      onStoreOpened={() => setUsePassword(false)}
    />
  );
}

function Home() {
  const { user } = useAuth();
  if (user?.role === "seller") return <SalePage />; // sotuvchining bosh sahifasi — sotuv ekrani
  if (user?.role === "platform_owner") return <BusinessesPage />;
  if (user?.role === "owner") return <Dashboard />;
  return <Navigate to="/stock" replace />; // omborchining ishi — qoldiqdan boshlanadi
}

/** Platforma paneli sahifalari — faqat platforma egasi uchun. */
function PlatformOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "platform_owner" ? children : <Navigate to="/" replace />;
}

/** Faqat biznes egalari ko'radigan sahifalar. (Asosiy himoya serverda — bu faqat interfeys uchun.) */
function OwnerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "owner" ? children : <Navigate to="/" replace />;
}

/**
 * Biznes egasi va omborchi uchun sahifalar (profil, katalog). Sotuvchi faqat PIN bilan kiradi va
 * do'kon qurilmasi qobig'ida ishlaydi; platforma egasi biznes ichidagi sahifalarga kirmaydi.
 */
function NotForSeller({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "warehouse";
  return allowed ? children : <Navigate to="/" replace />;
}

/** Biznes xodimlari (ega, omborchi, sotuvchi) uchun sahifalar — platforma egasi biznes ichiga kirmaydi. */
function StaffOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user && user.role !== "platform_owner" ? children : <Navigate to="/" replace />;
}

const staff = (page: ReactNode) => <StaffOnly>{page}</StaffOnly>;

/** Sotuv va nasiya sahifalari — biznes egasi va sotuvchi uchun (omborchi sotmaydi). */
function SalesStaff({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const allowed = user?.role === "owner" || user?.role === "seller";
  return allowed ? children : <Navigate to="/" replace />;
}

/** Marshrutlar. Har modul o'z sahifalarini `Protected` ichiga qo'shadi. */
export const router = createBrowserRouter(
  [
    { path: "/login", element: <GuestOnly /> },
    {
      path: "/",
      element: <Protected />,
      children: [
        { index: true, element: <Home /> },
        {
          path: "profile",
          element: (
            <NotForSeller>
              <ProfilePage />
            </NotForSeller>
          ),
        },
        {
          path: "structure",
          element: (
            <OwnerOnly>
              <StructureLayout />
            </OwnerOnly>
          ),
          children: [
            { index: true, element: <LocationsPage key="store" type="store" /> },
            { path: "warehouses", element: <LocationsPage key="warehouse" type="warehouse" /> },
            { path: "staff", element: <StaffPage /> },
            { path: "devices", element: <DevicesPage /> },
          ],
        },
        {
          path: "catalog",
          element: (
            <NotForSeller>
              <CatalogLayout />
            </NotForSeller>
          ),
          children: [
            { index: true, element: <FabricsPage /> },
            { path: "colors", element: <AttributesPage key="colors" kind="colors" /> },
            { path: "patterns", element: <AttributesPage key="patterns" kind="patterns" /> },
            { path: "skus", element: <SkusPage /> },
            { path: "skus/:id", element: <SkuPage /> },
          ],
        },
        {
          path: "receiving",
          element: (
            <NotForSeller>
              <Outlet />
            </NotForSeller>
          ),
          children: [
            { index: true, element: <ReceiptsPage /> },
            { path: "new", element: <ReceiptCreatePage /> },
            { path: ":id", element: <ReceiptPage /> },
          ],
        },
        // Ombor: qoldiq va ko'chirishlarni sotuvchi ham ko'radi (do'kon qurilmasi qobig'ida)
        { path: "stock", element: staff(<StockPage />) },
        { path: "batches/:id", element: staff(<BatchPage />) },
        { path: "close", element: staff(<CloseBatchPage />) },
        { path: "transfers", element: staff(<TransfersPage />) },
        {
          path: "transfers/new",
          element: (
            <NotForSeller>
              <TransferCreatePage />
            </NotForSeller>
          ),
        },
        { path: "transfers/:id", element: staff(<TransferPage />) },
        { path: "notifications", element: staff(<NotificationsPage />) },
        // Sotuv: sotuvchining sotuv ekrani — bosh sahifa ("/"); biznes egasi do'konni tanlab "/sales/new" da sotadi
        {
          path: "sales",
          element: (
            <SalesStaff>
              <Outlet />
            </SalesStaff>
          ),
          children: [
            { index: true, element: <SalesPage /> },
            {
              path: "new",
              element: (
                <OwnerOnly>
                  <SalePage />
                </OwnerOnly>
              ),
            },
            { path: ":id", element: <SaleCardPage /> },
          ],
        },
        // Nasiya: mijozlar va qarzlar (biznes egasida menyuda "Nasiya", sotuvchida — "Mijozlar")
        {
          path: "customers",
          element: (
            <SalesStaff>
              <Outlet />
            </SalesStaff>
          ),
          children: [
            { index: true, element: <CustomersPage /> },
            { path: ":id", element: <CustomerPage /> },
          ],
        },
        {
          path: "differences",
          element: (
            <OwnerOnly>
              <DifferencesPage />
            </OwnerOnly>
          ),
        },
        {
          path: "reports",
          element: (
            <OwnerOnly>
              <ReportsLayout />
            </OwnerOnly>
          ),
          children: [
            { index: true, element: <SalesReportPage /> },
            { path: "hours", element: <HoursReportPage /> },
            { path: "top", element: <TopReportPage /> },
            { path: "stock", element: <StockReportPage /> },
            { path: "credit", element: <CreditReportPage /> },
            { path: "price-deviation", element: <DeviationReportPage /> },
          ],
        },
        {
          path: "settings",
          element: (
            <OwnerOnly>
              <SettingsLayout />
            </OwnerOnly>
          ),
          children: [
            { index: true, element: <SettingsPage /> },
            { path: "journal", element: <JournalPage /> },
          ],
        },
        {
          path: "businesses/new",
          element: (
            <PlatformOnly>
              <BusinessCreatePage />
            </PlatformOnly>
          ),
        },
        {
          path: "businesses/:id",
          element: (
            <PlatformOnly>
              <BusinessPage />
            </PlatformOnly>
          ),
        },
        {
          path: "security",
          element: (
            <PlatformOnly>
              <SecurityPage />
            </PlatformOnly>
          ),
        },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { future: { v7_relativeSplatPath: true } },
);
