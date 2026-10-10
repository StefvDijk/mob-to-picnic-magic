import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import Index from "./pages/Index";
import DesignSystem from "./pages/DesignSystem";
import ShoppingPreview from "./pages/ShoppingPreview";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function PreviousRecipeLink() {
  const { recipeId } = useParams();
  return <Navigate replace to={`/boodschappen/${encodeURIComponent(recipeId!)}`} />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ShoppingPreview />}>
            <Route path="boodschappen/:recipeId" />
            <Route path="picnic" />
            <Route path="account" />
            <Route path="recepten" />
          </Route>
          <Route path="/recepten/nieuw" element={<Navigate replace to="/" />} />
          <Route path="/recepten/concept" element={<Navigate replace to="/" />} />
          <Route path="/recepten/:recipeId" element={<PreviousRecipeLink />} />
          <Route path="/recepten/:recipeId/bewerken" element={<PreviousRecipeLink />} />
          <Route path="/recepten/:recipeId/boodschappen" element={<PreviousRecipeLink />} />
          <Route path="/beheer" element={<Index />} />
          <Route path="/preview" element={<ShoppingPreview preview />}><Route path="boodschappen/:recipeId" /><Route path="picnic" /><Route path="account" /><Route path="recepten" /></Route>
          <Route path="/design-system" element={<DesignSystem />} />
          <Route path="/invite" element={<Navigate replace to="/" />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
