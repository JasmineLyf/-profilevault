import type { Features } from './protocol';
import { normalize } from './normalize';
const forbidden =
  /(密码|口令|验证码|校验码|恢复码|安全问题|密保|银行卡|信用卡|支付|账户凭据|有效期|身份证|护照|社保|证件|签名|生物识别|password|passcode|one time|otp|verification|security code|recovery code|security question|credit card|card number|cardholder|cvv|cvc|expiry|expiration|iban|bank account|routing number|passport|social security|ssn|national id|identity number|identification number|\bid number\b|signature)/i;
const consent =
  /(同意|条款|隐私|协议|声明|订阅|营销|签署|授权|承诺|consent|agree|terms|privacy|subscribe|newsletter|marketing|declaration|certify|signature)/i;
export function blockedReason(
  f: Pick<
    Features,
    | 'label'
    | 'labelledby'
    | 'ariaLabel'
    | 'name'
    | 'id'
    | 'placeholder'
    | 'autocomplete'
    | 'type'
    | 'context'
  >,
) {
  const raw = [
    f.label,
    f.labelledby,
    f.ariaLabel,
    f.name,
    f.id,
    f.placeholder,
    f.autocomplete,
  ].join(' ');
  const text = normalize(raw);
  if (['password', 'hidden', 'submit', 'button', 'reset', 'image'].includes(f.type))
    return '禁止或非资料控件';
  if (forbidden.test(text) || forbidden.test(normalize(f.context)) || /\bcc /.test(text))
    return '禁止填写：凭据、验证码、支付或证件';
  if (
    consent.test(text) ||
    (['checkbox', 'radio'].includes(f.type) && consent.test(normalize(f.context)))
  )
    return '禁止填写：协议、营销或声明';
  if (f.type === 'search' && /(search|query|搜索|检索)/i.test(text + ' ' + f.context))
    return '搜索上下文不填写个人信息';
  if (f.type === 'file' && !/(简历|resume|\bcv\b)/i.test(text)) return '仅支持明确的简历上传框';
  return undefined;
}
