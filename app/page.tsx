import ChatWidget from "@/components/ChatWidget";

export default function Home() {
  return (
      <main className="min-h-screen bg-neutral-100 p-10">
        <h1 className="text-3xl font-bold">Kajabi Chatbot Demo</h1>
        <p className="mt-3 text-neutral-600">
          Lokale Testseite für den späteren Kajabi-Chatbot.
        </p>

        <ChatWidget />
      </main>
  );
}