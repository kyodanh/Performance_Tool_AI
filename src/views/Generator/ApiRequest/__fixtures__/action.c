Action()
{
	web_add_auto_header("Authorization",
		"Bearer {token}");

	lr_start_transaction("2_trans_Dashboard");

	web_add_header("Sec-Fetch-Dest", 
		"script");

	web_add_header("Origin", 
		"https://pro360-test.fis.vn");

	web_add_auto_header("sec-ch-ua-mobile", 
		"?0");

	web_url("800.f030a379d792a8fa.js", 
		"URL=https://pro360-test.fis.vn/800.f030a379d792a8fa.js", 
		"Resource=1", 
		"RecContentType=application/javascript", 
		"Referer=https://pro360-test.fis.vn/dashboardRA", 
		"Snapshot=t14.inf", 
		LAST);

	web_add_cookie("redirect_url=/dashboard; DOMAIN=pro360-test.fis.vn");

	web_add_header("at", 
		"eyJ0eXAiOiJKV1Qi"
		"LCJhbGciOiJSUzI1NiJ9.payload");

	web_url("getByType_3", 
		"URL=https://pro360-test.fis.vn/api/pro360-masterdata/public/systemconfig/getByType?type=SOURCE", 
		"Resource=0", 
		"RecContentType=application/json", 
		"Mode=HTML", 
		EXTRARES, 
		"Url=/assets/images/dashboard.png", "Referer=https://pro360-test.fis.vn/dashboard", ENDITEM, 
		"Url=/703.0a273d4eb84d55a0.js", "Referer=https://pro360-test.fis.vn/dashboard", ENDITEM, 
		LAST);

	lr_end_transaction("2_trans_Dashboard",LR_AUTO);

	lr_start_transaction("6_trans_ProjectMonitoring");

	lr_think_time(38);

	// a comment mentioning web_url("not a call") must be ignored
	web_custom_request("getBGAndOUOfUser", 
		"URL=https://pro360-test.fis.vn/api/api/project-details/getBGAndOUOfUser", 
		"Method=POST", 
		"Resource=0", 
		"EncType=application/json; charset=UTF-8", 
		"Body={\"bg\":\"x\",\"ou\":[]}", 
		LAST);

	lr_think_time(5);

	lr_rendezvous("sync");

	web_submit_data("login", 
		"Action=https://pro360-test.fis.vn/api/login", 
		"Method=POST", 
		"URL=https://pro360-test.fis.vn/api/login", 
		ITEMDATA, 
		"Name=username", "Value={user}", ENDITEM, 
		"Name=password", "Value=secret", ENDITEM, 
		LAST);

	lr_end_transaction("6_trans_ProjectMonitoring",LR_AUTO);

	return 0;
}
