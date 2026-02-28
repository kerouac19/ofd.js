import {
    sm2
} from "sm-crypto";
import {sm3} from "@/utils/ofd/sm3";
import md5 from "js-md5";
import sha1 from "js-sha1"
import rsa from "jsrsasign"
import {Uint8ArrayToHexString} from "@/utils/ofd/ofd_util";
import { Base64 } from "@lapo/asn1js/base64";

const SM2_DEFAULT_USER_ID = "1234567812345678";

const RSA_ALG_MAP = {
    '1.2.840.113549.1.1.5': 'SHA1withRSA',
    '1.2.840.113549.1.1.11': 'SHA256withRSA',
    '1.2.840.113549.1.1.12': 'SHA384withRSA',
    '1.2.840.113549.1.1.13': 'SHA512withRSA',
    '1.2.840.113549.1.1.14': 'SHA224withRSA',
};

const resolveRsaAlg = function (signAlg) {
    for (const oid of Object.keys(RSA_ALG_MAP)) {
        if (signAlg.indexOf(oid) >= 0) {
            return RSA_ALG_MAP[oid];
        }
    }
    if (signAlg.indexOf('sha512') >= 0) return 'SHA512withRSA';
    if (signAlg.indexOf('sha384') >= 0) return 'SHA384withRSA';
    if (signAlg.indexOf('sha256') >= 0) return 'SHA256withRSA';
    if (signAlg.indexOf('sha224') >= 0) return 'SHA224withRSA';
    return 'SHA1withRSA';
};

export const digestByteArray = function(data, hashedBase64, checkMethod){
    const hashedHex = Uint8ArrayToHexString(Base64.decode(hashedBase64));
    checkMethod = checkMethod.toLowerCase();
    if(checkMethod.indexOf("1.2.156.10197.1.401")>=0 || checkMethod.indexOf("sm3")>=0){
        return hashedHex==sm3(Uint8ArrayToHexString(data));
    }else if(checkMethod.indexOf("md5")>=0){
        return hashedHex==md5(data);
    }else if(checkMethod.indexOf("sha1")>=0){
        return hashedHex==sha1(data);
    }else if(checkMethod.indexOf("sha512")>=0 || checkMethod.indexOf("2.16.840.1.101.3.4.2.3")>=0){
        return hashedHex==rsa.KJUR.crypto.Util.hashHex(Uint8ArrayToHexString(data), 'sha512');
    }else if(checkMethod.indexOf("sha256")>=0 || checkMethod.indexOf("2.16.840.1.101.3.4.2.1")>=0){
        return hashedHex==rsa.KJUR.crypto.Util.hashHex(Uint8ArrayToHexString(data), 'sha256');
    }else{
        console.warn(`不支持的摘要算法: ${checkMethod}`);
        return false;
    }
}

export const SES_Signature_Verify = function(SES_Signature, userId){
    try {
        let signAlg = SES_Signature.realVersion<4?SES_Signature.toSign.signatureAlgorithm:SES_Signature.signatureAlgID;
        signAlg = signAlg.toLowerCase();
        const msg = SES_Signature.toSignDer;
        if(signAlg.indexOf("1.2.156.10197.1.501")>=0 || signAlg.indexOf("sm2")>=0){
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let publicKey = cert.subjectPublicKeyInfo.subjectPublicKey.replace(/ /g,'').replace(/\n/g,'');
            if(publicKey.indexOf('00')==0){
                publicKey = publicKey.substr(2,publicKey.length-2);
            }
            return sm2.doVerifySignature(msg, sigValueHex, publicKey, {
                der : true,
                hash: true,
                userId: userId || SM2_DEFAULT_USER_ID
            });
        }else{
            const rsaAlg = resolveRsaAlg(signAlg);
            let sig = new rsa.KJUR.crypto.Signature({"alg": rsaAlg});
            const cert = SES_Signature.realVersion<4?SES_Signature.toSign.cert:SES_Signature.cert;
            let sigValueHex = SES_Signature.signature.replace(/ /g,'').replace(/\n/g,'');
            if(sigValueHex.indexOf('00')==0){
                sigValueHex = sigValueHex.substr(2,sigValueHex.length-2);
            }
            sig.init(cert);
            sig.updateHex(msg);
            return sig.verify(sigValueHex);
        }
    } catch (e) {
        console.log(e)
        return false;
    }
}
