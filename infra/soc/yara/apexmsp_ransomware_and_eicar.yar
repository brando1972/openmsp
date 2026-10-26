/*
 * ApexMSP YARA-X / ClamAV Bounded Signature Ruleset (v2.0)
 * License: BSD-3-Clause / First-Party ApexMSP Security
 */

rule APEXMSP_EICAR_Standard_Test_File {
    meta:
        description = "Detects standard EICAR anti-malware test signature for pipeline verification"
        author = "ApexMSP Security Engineering"
        severity = "high"
        mitre_attack = "T1204"
        rule_id = "YARA-100501"
    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}

rule APEXMSP_Ransomware_ShadowCopy_Recovery_Inhibition {
    meta:
        description = "Detects Windows Volume Shadow Copy deletion and boot recovery inhibition commands"
        author = "ApexMSP Security Engineering"
        severity = "critical"
        mitre_attack = "T1490"
        rule_id = "YARA-100502"
    strings:
        $vss1 = "vssadmin delete shadows" nocase
        $vss2 = "vssadmin.exe delete shadows" nocase
        $wmic = "wmic shadowcopy delete" nocase
        $wbadm = "wbadmin delete catalog" nocase
        $bcd1 = "bcdedit /set {default} recoveryenabled no" nocase
        $bcd2 = "bcdedit /set {default} bootstatuspolicy ignoreallfailures" nocase
        $cipher = "cipher /w:" nocase
    condition:
        any of ($vss1, $vss2, $wmic, $wbadm, $bcd1, $bcd2, $cipher)
}

rule APEXMSP_Canary_Tripwire_Tamper_Marker {
    meta:
        description = "Detects unauthorized modification or encryption header on ApexMSP canary tripwire files"
        author = "ApexMSP Security Engineering"
        severity = "critical"
        mitre_attack = "T1486"
        rule_id = "YARA-100503"
    strings:
        $canary_id = "APEXMSP-CANARY-TRIPWIRE-DO-NOT-MODIFY"
        $ransom_note1 = "YOUR FILES HAVE BEEN ENCRYPTED" nocase
        $ransom_note2 = "readme_to_decrypt" nocase
        $lockbit = ".lockbit" nocase
    condition:
        any of ($ransom_note1, $ransom_note2, $lockbit) and not $canary_id
}

rule APEXMSP_Suspicious_Encoded_PowerShell_Stager {
    meta:
        description = "Detects hidden/encoded PowerShell download cradles and AMSI bypass strings"
        author = "ApexMSP Security Engineering"
        severity = "high"
        mitre_attack = "T1059.001"
        rule_id = "YARA-100504"
    strings:
        $enc = "-EncodedCommand" nocase
        $enc_short = "-enc " nocase
        $amsi = "AmsiScanBuffer" nocase
        $iex = "Invoke-Expression" nocase
        $dl = "Net.WebClient" nocase
    condition:
        ($enc or $enc_short) and ($amsi or $iex or $dl)
}
