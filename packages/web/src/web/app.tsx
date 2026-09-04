import { Route, Switch } from "wouter";
import { Provider } from "./components/provider";
import { AgentFeedback } from "@runablehq/website-runtime";
import Login from "./pages/login";
import POS from "./pages/pos";
import KDS from "./pages/kds";
import Admin from "./pages/admin";
import Home from "./pages/home";
import Sales from "./pages/sales";
import Purchase from "./pages/purchase";
import PurchasesList from "./pages/purchases/index";
import PurchaseItems from "./pages/purchases/items";
import PurchaseSuppliers from "./pages/purchases/suppliers";
import Products from "./pages/products";
import ComboPromo from "./pages/combo-promo";
import Expenses from "./pages/expenses";
import Reports from "./pages/reports";
import SalesReport from "./pages/reports/sales";
import MenuReport from "./pages/reports/menu";
import InventoryReport from "./pages/reports/inventory";
import PLReport from "./pages/reports/pl";
import StaffReport from "./pages/reports/staff";
import CustomerAnalytics from "./pages/reports/customers";
import Kitchen from "./pages/kitchen";
import Settings from "./pages/settings";
import Users from "./pages/users";
import Customers from "./pages/customers";
import MessagePlatform from "./pages/message-platform";
import MessageSettings from "./pages/message-platform/settings";
import Tables from "./pages/tables";
import Categories from "./pages/categories";
import Ingredients from "./pages/ingredients";
import Modifiers from "./pages/modifiers";
import Promotions from "./pages/promotions";
import CustomerDisplay from "./pages/customer-display";
import InvoicePrint from "./pages/invoice-print";
import Menu from "./pages/menu";
import Idsa from "./pages/idsa";

function App() {
  return (
    <Provider>
      <Switch>
        <Route path="/" component={Login} />
        <Route path="/pos" component={POS} />
        <Route path="/kds" component={KDS} />
        <Route path="/admin" component={Admin} />
        <Route path="/home" component={Home} />
        <Route path="/sales" component={Sales} />
        <Route path="/purchase" component={Purchase} />
        <Route path="/purchases" component={PurchasesList} />
        <Route path="/purchases/items" component={PurchaseItems} />
        <Route path="/purchases/suppliers" component={PurchaseSuppliers} />
        <Route path="/products" component={Products} />
        <Route path="/combo-promo" component={ComboPromo} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/reports" component={SalesReport} />
        <Route path="/reports/sales" component={SalesReport} />
        <Route path="/reports/menu" component={MenuReport} />
        <Route path="/reports/inventory" component={InventoryReport} />
        <Route path="/reports/pl" component={PLReport} />
        <Route path="/reports/staff" component={StaffReport} />
        <Route path="/reports/customers" component={CustomerAnalytics} />
        <Route path="/kitchen" component={Kitchen} />
        <Route path="/settings" component={Settings} />
        <Route path="/users" component={Users} />
        <Route path="/customers" component={Customers} />
        <Route path="/message-platform" component={MessagePlatform} />
        <Route path="/message-platform/settings" component={MessageSettings} />
        <Route path="/tables" component={Tables} />
        <Route path="/categories" component={Categories} />
        <Route path="/ingredients" component={Ingredients} />
        <Route path="/modifiers" component={Modifiers} />
        <Route path="/promotions" component={Promotions} />
        <Route path="/customer-display" component={CustomerDisplay} />
        <Route path="/invoice/:id" component={InvoicePrint} />
        <Route path="/menu" component={Menu} />
        <Route path="/idsa" component={Idsa} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </Provider>
  );
}

export default App;
