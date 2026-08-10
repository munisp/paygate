"""
ISO 20022 Parser Microservice
Parses and generates ISO 20022 XML messages for RTGS/SWIFT/NIBSS interoperability.
Supports: pain.001 (credit transfer), pacs.008 (FI credit transfer), camt.053 (bank statement)
Exposes:
  POST /parse   - parse ISO 20022 XML to JSON
  POST /generate - generate ISO 20022 XML from JSON
  GET  /schemas - list supported message schemas
"""
import os
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("iso20022-parser")

app = Flask(__name__)

SUPPORTED_SCHEMAS = {
    "pain.001.001.09": "Customer Credit Transfer Initiation",
    "pacs.008.001.08": "FI to FI Customer Credit Transfer",
    "pacs.002.001.10": "FI to FI Payment Status Report",
    "camt.053.001.08": "Bank to Customer Statement",
    "camt.054.001.08": "Bank to Customer Debit/Credit Notification",
    "pain.002.001.10": "Customer Payment Status Report",
}

NS = {
    "pain001": "urn:iso:std:iso:20022:tech:xsd:pain.001.001.09",
    "pacs008": "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08",
    "camt053": "urn:iso:std:iso:20022:tech:xsd:camt.053.001.08",
}


def parse_pain001(root):
    """Parse pain.001 Customer Credit Transfer."""
    ns = NS["pain001"]
    result = {"message_type": "pain.001", "transactions": []}

    grp_hdr = root.find(f".//{{{ns}}}GrpHdr")
    if grp_hdr is not None:
        result["message_id"] = _text(grp_hdr, f"{{{ns}}}MsgId")
        result["creation_datetime"] = _text(grp_hdr, f"{{{ns}}}CreDtTm")
        result["number_of_transactions"] = _text(grp_hdr, f"{{{ns}}}NbOfTxs")
        result["control_sum"] = _text(grp_hdr, f"{{{ns}}}CtrlSum")

    for pmt_inf in root.findall(f".//{{{ns}}}PmtInf"):
        for cdt_trf in pmt_inf.findall(f".//{{{ns}}}CdtTrfTxInf"):
            txn = {
                "end_to_end_id": _text(cdt_trf, f".//{{{ns}}}EndToEndId"),
                "amount": _text(cdt_trf, f".//{{{ns}}}InstdAmt"),
                "currency": _attr(cdt_trf, f".//{{{ns}}}InstdAmt", "Ccy"),
                "creditor_name": _text(cdt_trf, f".//{{{ns}}}Cdtr/{{{ns}}}Nm"),
                "creditor_account": _text(cdt_trf, f".//{{{ns}}}CdtrAcct/{{{ns}}}Id/{{{ns}}}Othr/{{{ns}}}Id"),
                "creditor_bank_bic": _text(cdt_trf, f".//{{{ns}}}CdtrAgt/{{{ns}}}FinInstnId/{{{ns}}}BICFI"),
                "remittance_info": _text(cdt_trf, f".//{{{ns}}}RmtInf/{{{ns}}}Ustrd"),
            }
            result["transactions"].append(txn)

    return result


def _text(element, path):
    node = element.find(path)
    return node.text if node is not None else None


def _attr(element, path, attr):
    node = element.find(path)
    return node.get(attr) if node is not None else None


def generate_pain001(data):
    """Generate pain.001 XML from structured data."""
    ns = NS["pain001"]
    msg_id = data.get("message_id", f"MSG-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}")
    creation_dt = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    transactions = data.get("transactions", [])

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="{ns}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{creation_dt}</CreDtTm>
      <NbOfTxs>{len(transactions)}</NbOfTxs>
      <CtrlSum>{sum(float(t.get('amount', 0)) for t in transactions):.2f}</CtrlSum>
      <InitgPty>
        <Nm>{data.get('initiating_party', 'PayGate')}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>{msg_id}-PMT</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>{len(transactions)}</NbOfTxs>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>
        <Dt>{datetime.now(timezone.utc).strftime('%Y-%m-%d')}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>{data.get('debtor_name', 'Merchant')}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id><Othr><Id>{data.get('debtor_account', '0000000000')}</Id></Othr></Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId><BICFI>{data.get('debtor_bank_bic', 'GTBINGLA')}</BICFI></FinInstnId>
      </DbtrAgt>"""

    for txn in transactions:
        xml += f"""
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>{txn.get('end_to_end_id', 'NOTPROVIDED')}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="{txn.get('currency', 'NGN')}">{float(txn.get('amount', 0)):.2f}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId><BICFI>{txn.get('creditor_bank_bic', 'ZENBNLGA')}</BICFI></FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>{txn.get('creditor_name', 'Beneficiary')}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id><Othr><Id>{txn.get('creditor_account', '0000000000')}</Id></Othr></Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>{txn.get('remittance_info', 'Payment')}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>"""

    xml += """
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>"""

    return xml


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "iso20022-parser"})


@app.route("/schemas")
def schemas():
    return jsonify({
        "supported_schemas": SUPPORTED_SCHEMAS,
        "count": len(SUPPORTED_SCHEMAS),
    })


@app.route("/parse", methods=["POST"])
def parse():
    """Parse ISO 20022 XML to JSON."""
    xml_data = request.data
    if not xml_data:
        # Try JSON body with xml field
        body = request.get_json() or {}
        xml_data = body.get("xml", "").encode()

    if not xml_data:
        return jsonify({"error": "XML body required"}), 400

    try:
        root = ET.fromstring(xml_data)
        ns_uri = root.tag.split("}")[0].lstrip("{") if "}" in root.tag else ""

        # Detect message type from namespace
        if "pain.001" in ns_uri:
            result = parse_pain001(root)
        else:
            # Generic parse: return tag/text tree
            result = {"message_type": "unknown", "namespace": ns_uri, "raw_tags": [
                {"tag": child.tag, "text": child.text} for child in root.iter()
            ][:50]}

        return jsonify({
            "parsed": result,
            "parsed_at": datetime.now(timezone.utc).isoformat(),
        })
    except ET.ParseError as e:
        return jsonify({"error": f"XML parse error: {e}"}), 400


@app.route("/generate", methods=["POST"])
def generate():
    """Generate ISO 20022 XML from structured JSON."""
    data = request.get_json() or {}
    message_type = data.get("message_type", "pain.001")

    if message_type == "pain.001":
        xml = generate_pain001(data)
        return app.response_class(
            response=xml,
            status=200,
            mimetype="application/xml",
        )
    else:
        return jsonify({"error": f"message_type '{message_type}' not yet supported for generation"}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9014))
    log.info("iso20022-parser starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
