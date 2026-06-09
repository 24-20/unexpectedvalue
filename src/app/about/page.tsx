import { Button } from "@/components/ui";
import { Hero } from "@/components/blocks";

const UNX_ASCII = `
██╗   ██╗ ███╗   ██╗ ██╗  ██╗
██║   ██║ ████╗  ██║ ╚██╗██╔╝
██║   ██║ ██╔██╗ ██║  ╚███╔╝
██║   ██║ ██║╚██╗██║  ██╔██╗
╚██████╔╝ ██║ ╚████║ ██╔╝ ██╗
 ╚═════╝  ╚═╝  ╚═══╝ ╚═╝  ╚═╝
`;

export default function AboutPage() {
  return (
    <Hero
      eyebrow="[ Private equity // machine learning ]"
      title={
        <>
          Value, found where{" "}
          <span className="underline decoration-2 underline-offset-[6px]">
            others don&apos;t look
          </span>
          .
        </>
      }
      subtitle="A small private equity firm using machine learning to surface opportunities the market overlooks."
      ascii={UNX_ASCII}
      actions={
        <Button variant="primary" size="lg">
          Get in touch →
        </Button>
      }
    />
  );
}
