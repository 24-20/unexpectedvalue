import { Container, Mono } from "@/components/ui";
import { AsciiBackdrop } from "@/components/blocks";

// "Saturn as seen from one of its moons" — sourced from ascii.co.uk/art/saturn
const SPACE_ASCII = String.raw`
                                 o         .                       .
                .               0                            .
     *   .                  .              .        .   *          .
  .         .                     .       .           .      .        .
                             O        .             +     .
         .              .   *              .           .
       +        .
                 .        o                   ,                ,    ,
 .                                               .
      .          ,      /                                     +
   .          .     .  /              .                   .            .
     .          ,,,  ,o          ,             .                .
              #*#,  #/#,,  .                              .        .
            ##*#,  #/##,#               .                        .
   .       ##*#,  #O##,#*#                +     .                     ,
        .    #,  #/##,#*##              .                     .
      .     \   #%##,#*##         .                             ,       .
          .   \_ /      /.   .                    .             .          ,
  ,            /   -             .                         .
____^/\___^--_O__/\_____-^^-^--_______/\/\---/\__________---______________
   /\^   ^  ^    ^       ^/\        ^^ ^  '\ ^          ^       ---
         --       __ _-            --  -      -         ---  __       ^
   --  __                      ___--  ^  ^           ^^ ^   ^-__   --  __
`;

export default function AboutPage() {
  return (
    <div className="relative flex-1 flex items-center py-16 md:py-24 overflow-hidden">
      <AsciiBackdrop art={SPACE_ASCII} />
      <Container className="relative z-10">
        <div className="max-w-2xl">
          <Mono className="text-muted">
            [ Private equity // machine learning ]
          </Mono>
          <h1 className="mt-4 text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-normal tracking-[-0.01em] leading-[1.05]">
            We are dedicated to finding value where{" "}
            <span className="underline decoration-2 underline-offset-[6px]">
              others don&apos;t look
            </span>
            .
          </h1>
          <p className="mt-6 text-base sm:text-lg md:text-xl text-muted max-w-xl leading-relaxed">
            A small private equity firm using machine learning to surface
            opportunities the market overlooks.
          </p>
        </div>
      </Container>
    </div>
  );
}
