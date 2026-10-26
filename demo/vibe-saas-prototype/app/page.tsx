export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">AI Avatar Generator SaaS</h1>
      </div>

      <div className="my-12">
        <button className="px-6 py-3 bg-blue-600 text-white rounded-lg">
          Generate Avatar with Gemini AI
        </button>
      </div>

      <footer className="w-full text-center py-6 border-t border-gray-200">
        <p>© 2026 AI Avatar SaaS. <a href="#">Terms</a> | <a href="#">Privacy</a></p>
      </footer>
    </main>
  );
}
