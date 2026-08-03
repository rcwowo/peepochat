import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const LEARN_MORE_ITEMS = [
  {
    question: "Is Peepochat open source?",
    answer: (
      <>
        Yes! The project originally started as a fork of it's parent project,{" "}
        <a
          href="https://chatvoice.rcw.lol"
          target="_blank"
          rel="noopener noreferrer"
        >
          Chatvoice
        </a>
        , since it also focused on partially being a chat client. You can view
        the source code or help contribute to the project on{" "}
        <a
          href="https://github.com/rcwowo/peepochat"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </>
    ),
  },
  {
    question: "Do I need to download or install anything?",
    answer: (
      <>
        Nope. Peepochat runs entirely in your browser. Open the app, sign in
        with Twitch, and you&apos;re ready to go. You can, however, install the
        client as a PWA to add the client to your app list and access it without
        opening a full browser.
      </>
    ),
  },
  {
    question: "Where does my data actually go?",
    answer: (
      <>
        There is no server or external database used to store your data.
        Everything is stored locally in your browser&apos;s local storage,
        session storage, or IndexedDB. You have full control over your data and
        you can export or restore your data from a backup at any point.
      </>
    ),
  },
  {
    question: "Why aren't polls, predictions, or pinned messages supported?",
    answer: (
      <>
        Some chat clients display these features by utilizing Twitch&apos;s
        internal GraphQL layer. This isn&apos;t something that Peepochat is
        willing to support since it directly violates Twitch&apos;s terms of
        service and could result in either your account being banned or the
        client itself being taken down.
      </>
    ),
  },
  {
    question: "Why build a chat client for the web?",
    answer: (
      <>
        I wanted to make the chat client that I wanted to use, and truth be
        told, the browser is already everywhere. That makes the client
        compatible across Windows, macOS, Linux, ChromeOS, and even mobile -
        though I don&apos;t recommend it. The last thing that we need is yet
        another heavyweight Electron app taking up precious space and resources
        on your device.
      </>
    ),
  },
  {
    question: "How can I help support Peepochat?",
    answer: (
      <>
        You can help support the project in one of two ways: contributing to the
        development and maintainance of the project, or by becoming an OwO+
        member on my{" "}
        <a
          href="https://patreon.com/rcwowo"
          target="_blank"
          rel="noopener noreferrer"
        >
          Patreon
        </a>
        . OwO+ members can earn an exclusive badge that's displayed across all
        of my supported projects. And OwO+ Premier members can pick a custom
        badge of their choice instead.
        <br />
        <br />
        <strong>And don't worry,</strong> you get to keep it even if you decide
        to leave OwO+ later on.
      </>
    ),
  },
] as const

export function LearnMoreSection() {
  return (
    <section id="learn-more" className="relative border-t border-white/8">
      <div className="mx-auto w-full max-w-3xl px-6 pt-20 pb-8 lg:pt-24 lg:pb-10">
        <h2 className="text-center text-base font-medium text-muted-foreground sm:text-lg">
          Learn more about this project
        </h2>

        <Accordion
          type="single"
          collapsible
          className="mt-8 rounded-2xl border border-white/8 bg-card/30 px-5 sm:px-6"
        >
          {LEARN_MORE_ITEMS.map((item, index) => (
            <AccordionItem
              key={item.question}
              value={`item-${index}`}
              className="border-white/8"
            >
              <AccordionTrigger className="py-5 text-base font-medium hover:no-underline sm:text-[1.05rem]">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-[0.95rem] leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}
