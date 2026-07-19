import Banner from "@brand-components/Banner";
import Footer from "@brand-components/Footer";

const mode = DEV ? "development" : "production";

export default function App() {
  return (
    <main>
      <Banner />
      <p>Framework: React</p>
      <p>Vite mode: {mode}</p>
      <Footer />
    </main>
  );
}
