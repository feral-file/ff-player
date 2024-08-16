import Image from 'next/image';

export default function Microphone({
  onClick,
}: {
  onClick: (e: unknown) => void;
}) {
  return (
    <>
      <Image
        src="/images/micro.svg"
        alt="fullscreen"
        width={36}
        height={36}
        onClick={onClick}
      />
    </>
  );
}
