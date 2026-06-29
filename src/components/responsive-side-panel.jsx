"use client";



import { useLayoutEffect, useState } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";



const LG_MIN_WIDTH = 1024;



function useIsLargeScreen() {

  const [isLarge, setIsLarge] = useState(null);



  useLayoutEffect(() => {

    const mql = window.matchMedia(`(min-width: ${LG_MIN_WIDTH}px)`);

    const update = () => setIsLarge(mql.matches);

    update();

    mql.addEventListener("change", update);

    return () => mql.removeEventListener("change", update);

  }, []);



  return isLarge;

}



export function ResponsiveSidePanel({ open, onOpenChange, children }) {

  const isLarge = useIsLargeScreen();



  if (!open) return null;



  if (isLarge === false) {

    return (

      <Sheet open={open} onOpenChange={onOpenChange}>

        <SheetContent side="right" showCloseButton={false} className="w-full overflow-y-auto p-0 sm:max-w-md">

          {children}

        </SheetContent>

      </Sheet>

    );

  }



  return <div className="min-w-0 max-lg:hidden lg:block">{children}</div>;

}

