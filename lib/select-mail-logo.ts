import {mailLogo} from './mail-logo';
import {arreaMailLogo} from './arrea-mail-logo';
import {decasarreMailLogo} from './decasarre-mail-logo';
import {signatureBrand,type MailSignature} from './mail-signature';

const logos={arrea:{...arreaMailLogo,id:'arrea'},decasarre:{...decasarreMailLogo,id:'decasarre'},empresa:{...mailLogo,id:'empresa'}};
export type EmbeddedMailLogo=typeof logos[keyof typeof logos];
// Exports use only bundled images, never download a remote company logo.
export function profileMailLogo(profile:{logo:string}):EmbeddedMailLogo|null{
 if(profile.logo==='./arrea-logo.png')return logos.arrea;
 if(profile.logo==='./decasarre-logo.png')return logos.decasarre;
 if(profile.logo==='./empresa.svg')return logos.empresa;
 return null;
}
export function signatureMailLogo(signature:MailSignature):EmbeddedMailLogo|null{const brand=signatureBrand(signature);return brand?logos[brand]:null;}
