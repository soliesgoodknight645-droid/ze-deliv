import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Truck } from "lucide-react";

export function HeroBanner() {
  return (
    <section className="px-4 pt-3 pb-3">
      <div className="relative w-full aspect-[16/9] sm:aspect-[16/7] rounded-2xl overflow-hidden bg-brand-yellow">
        <Image
          src="/hero-new.png"
          alt="Bebida gelada em até 15 minutos"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-yellow/40 via-transparent to-transparent pointer-events-none" />

        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-dark/85 backdrop-blur-sm text-white text-[11px] font-semibold shadow-sm">
            <MapPin className="w-3 h-3 text-brand-yellow" />
            2,1km de você
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-dark/85 backdrop-blur-sm text-white text-[11px] font-semibold shadow-sm">
            <Clock className="w-3 h-3 text-brand-yellow" />
            15min até você
          </span>
        </div>

        <Link
          href="/produtos"
          aria-label="Peça agora"
          className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-yellow text-brand-dark text-xs font-extrabold shadow-md active:scale-95 transition-transform"
        >
          PEÇA AGORA <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="mt-2 rounded-xl bg-brand-dark text-white flex items-center justify-around px-3 py-2.5 text-[11px] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-brand-yellow" />
          Entregamos na sua localização
        </span>
        <span className="text-gray-700">|</span>
        <span className="inline-flex items-center gap-1.5 text-brand-yellow">
          <Truck className="w-3.5 h-3.5" />
          Frete grátis acima de R$ 20
        </span>
      </div>
    </section>
  );
}
