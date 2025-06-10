$(document).ready(function(){
  // Add smooth scrolling to all links in navbar + footer link
  $(".navbar a, footer a[href='#myPage']").on('click', function(event) {

  // Prevent default anchor click behavior
  event.preventDefault();

  // Store hash
  var hash = this.hash;

  // Using jQuery's animate() method to add smooth page scroll
  // The optional number (900) specifies the number of milliseconds it takes to scroll to the specified area
  $('html, body').animate({
    scrollTop: $(hash).offset().top
  }, 1000, function(){

    // Add hash (#) to URL when done scrolling (default click behavior)
    window.location.hash = hash;
    });
  });
})
/*//the subscribe form  section 
function myFuction(){
	
	alert ("Thank you for subscribing ");
	document.form
}
//email validation
function emailVallidation(inputText){
	var mailformat = /^w+([.-]?w+)*w+([.-]?w+)*(.w{2,3})+$/;
	if (inputText.value.match(mailformat)
	{
		alert*("thank ou for submiting")
		document.form1.emailadd.focus();
		return true
	}
	else{
		alert*("the email is invad")
		document.form1.emailadd.focus();
		return false
	}
}
*/
